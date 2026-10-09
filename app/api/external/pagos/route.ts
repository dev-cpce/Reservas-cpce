import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logger";
import { validarApiKeyN8n } from "@/lib/auth/apiKeyN8n";
import { 
  ApiResponse, 
  CrearPagoRequest, 
  ActualizarPagoRequest 
} from "@/types/api";

// ✅ Inicializador de cliente Supabase
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan variables de entorno de Supabase");
  return createClient(url, key);
}

// ✅ Validar API key de n8n
function validateApiKey(request: NextRequest) {
  return validarApiKeyN8n(request);
}

// ✅ Helper para devolver respuesta unificada
function jsonResponse<T>(status: number, payload: ApiResponse<T>) {
  return NextResponse.json(payload, { status });
}

// Registra en system_logs y responde un rechazo (4xx -> warning) o un fallo (5xx -> error).
function crearFallo(requestId: string, getMeta: () => Record<string, unknown>) {
  return async (status: number, error: string, extra: Record<string, unknown> = {}) => {
    await logSystemEvent({
      level: status >= 500 ? 'error' : 'warning',
      source: 'pagos-external',
      event: status >= 500 ? 'PAGO_EXTERNAL_ERROR' : 'PAGO_EXTERNAL_REJECTED',
      message: error,
      requestId,
      metadata: { ...getMeta(), ...extra, http_status: status },
    });

    return jsonResponse(status, { success: false, error });
  };
}

async function logPagoNoAutorizado(requestId: string, accion: string) {
  await logSystemEvent({
    level: 'warning',
    source: 'pagos-external',
    event: 'PAGO_EXTERNAL_UNAUTHORIZED',
    message: `Intento de ${accion} de pago con API Key inválida`,
    requestId,
  });
}

// 🧩 POST — Crear/Actualizar pago (UPSERT)
export async function POST(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'n8n', operacion: 'upsert' };
  const fallar = crearFallo(requestId, () => meta);

  try {
    if (!validateApiKey(request)) {
      await logPagoNoAutorizado(requestId, 'registro');
      return jsonResponse(401, { success: false, error: "API Key no válida" });
    }

    const body: CrearPagoRequest = await request.json();
    meta = {
      ...meta,
      id_reserva: body.id_reserva,
      monto: body.monto,
      estado_pago_nuevo: body.estado_pago,
      mp_id: body.mp_id ?? null,
    };
    
    // Validar campos requeridos
    if (!body.id_reserva || body.monto === undefined || !body.estado_pago) {
      return fallar(400, "Campos requeridos: id_reserva, monto, estado_pago");
    }

    // Validar estados válidos
    if (!['aprobado', 'pendiente', 'cancelado', 'desconocido'].includes(body.estado_pago)) {
      return fallar(400, "estado_pago debe ser: aprobado, pendiente, cancelado o desconocido");
    }

    const supabase = getSupabaseClient();

    // 1. Verificar que la reserva existe
    const { data: reserva, error: reservaError } = await supabase
      .from('reserva')
      .select('id_reserva, fecha_reserva, hora_inicio, hora_fin, estado_reserva, costo_reserva')
      .eq('id_reserva', body.id_reserva)
      .single();

    if (reservaError || !reserva) {
      return fallar(404, "Reserva no encontrada");
    }

    meta = { ...meta, estado_reserva: reserva.estado_reserva };

    let pago;
    let message = "";
    let accion: 'creado' | 'actualizado' = 'actualizado';
    let estadoPagoAnterior: string | null = null;

    // 2. UPSERT: Verificar si ya existe un pago para esta reserva con el mismo mp_id
    if (body.mp_id) {
      // Si hay mp_id, buscar pago existente por mp_id
      const { data: pagoExistente, error: buscarError } = await supabase
        .from('pago')
        .select('id_pago, id_reserva, monto, estado_pago')
        .eq('mp_id', body.mp_id)
        .single();

      if (pagoExistente && !buscarError) {
        estadoPagoAnterior = pagoExistente.estado_pago;

        // Actualizar pago existente
        const { data: pagoActualizado, error: actualizarError } = await supabase
          .from('pago')
          .update({
            monto: body.monto,
            estado_pago: body.estado_pago,
            id_reserva: body.id_reserva
          })
          .eq('mp_id', body.mp_id)
          .select(`
            id_pago,
            id_reserva,
            monto,
            estado_pago,
            mp_id,
            fecha_pago
          `)
          .single();

        if (actualizarError) {
          return fallar(500, "Error al actualizar el pago en la base de datos", {
            detalle: actualizarError.message,
          });
        }

        pago = pagoActualizado;
        message = `Pago de $${body.monto} actualizado exitosamente`;
      }
    }

    // Si no hay pago existente, crear uno nuevo
    if (!pago) {
      // También verificar si ya existe un pago para esta reserva (sin mp_id)
      const { data: pagoReserva, error: buscarReservaError } = await supabase
        .from('pago')
        .select('id_pago, estado_pago')
        .eq('id_reserva', body.id_reserva)
        .single();

      if (pagoReserva && !buscarReservaError) {
        estadoPagoAnterior = pagoReserva.estado_pago;

        // Ya existe un pago para esta reserva, actualizar
        const { data: pagoActualizado, error: actualizarError } = await supabase
          .from('pago')
          .update({
            monto: body.monto,
            estado_pago: body.estado_pago,
            mp_id: body.mp_id || null
          })
          .eq('id_reserva', body.id_reserva)
          .select(`
            id_pago,
            id_reserva,
            monto,
            estado_pago,
            mp_id,
            fecha_pago
          `)
          .single();

        if (actualizarError) {
          return fallar(500, "Error al actualizar el pago en la base de datos", {
            detalle: actualizarError.message,
          });
        }

        pago = pagoActualizado;
        message = `Pago de $${body.monto} actualizado exitosamente (por reserva)`;
      } else {
        // Crear nuevo pago
        const { data: pagoNuevo, error: crearError } = await supabase
          .from('pago')
          .insert({
            id_reserva: body.id_reserva,
            monto: body.monto,
            estado_pago: body.estado_pago,
            mp_id: body.mp_id || null
          })
          .select(`
            id_pago,
            id_reserva,
            monto,
            estado_pago,
            mp_id,
            fecha_pago
          `)
          .single();

        if (crearError) {
          return fallar(500, "Error al crear el pago en la base de datos", {
            detalle: crearError.message,
          });
        }

        pago = pagoNuevo;
        accion = 'creado';
        message = `Pago de $${body.monto} creado exitosamente`;
      }
    }

    await logSystemEvent({
      level: 'info',
      source: 'pagos-external',
      event: 'PAGO_EXTERNAL_UPSERTED',
      message: `Pago ${accion} correctamente desde n8n`,
      requestId,
      metadata: {
        ...meta,
        id_pago: pago.id_pago,
        accion,
        estado_pago_anterior: estadoPagoAnterior,
      },
    });

    // Dinero acreditado sobre una reserva ya cancelada: requiere revisión manual.
    if (body.estado_pago === 'aprobado' && reserva.estado_reserva === 'cancelada') {
      await logSystemEvent({
        level: 'critical',
        source: 'pagos-external',
        event: 'PAGO_EXTERNAL_APPROVED_ON_CANCELLED_RESERVA',
        message: 'Se aprobó un pago para una reserva que ya estaba cancelada',
        requestId,
        metadata: { ...meta, id_pago: pago.id_pago },
      });
    }

    return jsonResponse(200, {
      success: true,
      data: pago,
      message: message
    });

  } catch (e) {
    return fallar(500, e instanceof Error ? e.message : "Error interno del servidor");
  }
}

// 🧩 PUT — Actualizar estado de pago
export async function PUT(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'n8n', operacion: 'update_estado' };
  const fallar = crearFallo(requestId, () => meta);

  try {
    if (!validateApiKey(request)) {
      await logPagoNoAutorizado(requestId, 'actualización');
      return jsonResponse(401, { success: false, error: "API Key no válida" });
    }

    const body: ActualizarPagoRequest = await request.json();
    meta = {
      ...meta,
      id_pago: body.id_pago,
      estado_pago_nuevo: body.estado_pago,
      mp_id: body.mp_id ?? null,
    };
    
    // Validar campos requeridos
    if (!body.id_pago || !body.estado_pago) {
      return fallar(400, "Campos requeridos: id_pago, estado_pago");
    }

    // Validar estados válidos
    if (!['aprobado', 'pendiente', 'cancelado', 'desconocido'].includes(body.estado_pago)) {
      return fallar(400, "estado_pago debe ser: aprobado, pendiente, cancelado o desconocido");
    }

    const supabase = getSupabaseClient();

    // 1. Verificar que el pago existe
    const { data: pagoExistente, error: buscarError } = await supabase
      .from('pago')
      .select('id_pago, estado_pago, monto')
      .eq('id_pago', body.id_pago)
      .single();

    if (buscarError || !pagoExistente) {
      return fallar(404, "Pago no encontrado");
    }

    meta = { ...meta, estado_pago_anterior: pagoExistente.estado_pago };

    // 2. Actualizar estado del pago
    const updateData: {
      estado_pago: string;
      mp_id?: string | null;
    } = {
      estado_pago: body.estado_pago
    };

    if (body.mp_id !== undefined) {
      updateData.mp_id = body.mp_id;
    }

    const { data: pagoActualizado, error: actualizarError } = await supabase
      .from('pago')
      .update(updateData)
      .eq('id_pago', body.id_pago)
      .select(`
        id_pago,
        id_reserva,
        monto,
        estado_pago,
        mp_id,
        fecha_pago
      `)
      .single();

    if (actualizarError) {
      return fallar(500, "Error al actualizar el estado del pago", {
        detalle: actualizarError.message,
      });
    }

    await logSystemEvent({
      level: 'info',
      source: 'pagos-external',
      event: 'PAGO_EXTERNAL_STATUS_CHANGED',
      message: `Estado del pago actualizado a ${body.estado_pago} desde n8n`,
      requestId,
      metadata: {
        ...meta,
        id_reserva: pagoActualizado.id_reserva,
        monto: pagoActualizado.monto,
      },
    });

    return jsonResponse(200, {
      success: true,
      data: pagoActualizado,
      message: `Estado del pago actualizado a: ${body.estado_pago}`
    });

  } catch (e) {
    return fallar(500, e instanceof Error ? e.message : "Error interno del servidor");
  }
}

// 🧩 GET — Obtener pagos (opcional, para uso interno)
export async function GET(request: NextRequest) {
  try {
    if (!validateApiKey(request))
      return jsonResponse(401, { success: false, error: "API Key no válida" });

    const { searchParams } = new URL(request.url);
    const idReserva = searchParams.get('id_reserva');
    const estadoPago = searchParams.get('estado_pago');

    const supabase = getSupabaseClient();

    let query = supabase
      .from('pago')
      .select(`
        id_pago,
        id_reserva,
        monto,
        estado_pago,
        mp_id,
        fecha_pago
      `)
      .order('fecha_pago', { ascending: false });

    if (idReserva) {
      query = query.eq('id_reserva', parseInt(idReserva));
    }

    if (estadoPago) {
      query = query.eq('estado_pago', estadoPago);
    }

    const { data: pagos, error: pagosError } = await query;

    if (pagosError) {
      return jsonResponse(500, { 
        success: false, 
        error: "Error al consultar los pagos" 
      });
    }

    return jsonResponse(200, {
      success: true,
      data: pagos || [],
      message: `${pagos?.length || 0} pagos encontrados`
    });

  } catch (e) {
    return jsonResponse(500, {
      success: false,
      error: e instanceof Error ? e.message : "Error interno del servidor"
    });
  }
}
