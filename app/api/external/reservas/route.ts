import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ApiResponse } from '@/types/api';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan variables de entorno de Supabase');
  }

  return createClient(url, key);
}

function validateApiKey(request: NextRequest) {
  const apiKey = process.env.N8N_API_KEY;

  return Boolean(apiKey) && request.headers.get('x-api-key') === apiKey;
}

function jsonResponse<T>(status: number, payload: ApiResponse<T>) {
  return NextResponse.json(payload, { status });
}

interface CrearReservaExternalRequest {
  chat_id: string;
  id_recurso: number;
  fecha_reserva: string;
  hora_inicio: string;
  duracion_minutos: 90 | 120;
}

interface ActualizarReservaExternalRequest {
  chat_id: string;
  id_reserva: number;
  estado_reserva: 'pendiente' | 'confirmada' | 'cancelada';
}

function calcularHoraFin(
  horaInicio: string,
  duracionMinutos: number
): string | null {
  const match = /^(\d{2}):(\d{2})$/.exec(horaInicio);

  if (!match) {
    return null;
  }

  const horas = Number(match[1]);
  const minutos = Number(match[2]);

  if (
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    return null;
  }

  const totalMinutos = horas * 60 + minutos + duracionMinutos;

  if (totalMinutos >= 24 * 60) {
    return null;
  }

  const horaFin = Math.floor(totalMinutos / 60);
  const minutoFin = totalMinutos % 60;

  return `${horaFin.toString().padStart(2, '0')}:${minutoFin
    .toString()
    .padStart(2, '0')}`;
}

// ============================================================
// POST — Crear reserva desde n8n
// ============================================================

export async function POST(request: NextRequest) {
  try {
    if (!validateApiKey(request)) {
      return jsonResponse(401, {
        success: false,
        error: 'API Key no válida',
      });
    }

    const body: CrearReservaExternalRequest = await request.json();

    // --------------------------------------------------------
    // 1. Validar datos recibidos
    // --------------------------------------------------------

    if (
      !body.chat_id ||
      !body.id_recurso ||
      !body.fecha_reserva ||
      !body.hora_inicio ||
      !body.duracion_minutos
    ) {
      return jsonResponse(400, {
        success: false,
        error:
          'Campos requeridos: chat_id, id_recurso, fecha_reserva, hora_inicio, duracion_minutos',
      });
    }

    if (![90, 120].includes(body.duracion_minutos)) {
      return jsonResponse(400, {
        success: false,
        error: 'La duración debe ser de 90 o 120 minutos.',
      });
    }

    const horaFin = calcularHoraFin(
      body.hora_inicio,
      body.duracion_minutos
    );

    if (!horaFin) {
      return jsonResponse(400, {
        success: false,
        error: 'La hora de inicio o la duración generan un horario inválido.',
      });
    }

    const supabase = getSupabaseClient();

    // --------------------------------------------------------
    // 2. Buscar cliente por chat_id
    // --------------------------------------------------------

    const { data: cliente, error: clienteError } = await supabase
      .from('cliente')
      .select(
        'id_cliente, nombre, apellido, telefono, chat_id, tipo_cliente'
      )
      .eq('chat_id', body.chat_id)
      .maybeSingle();

    if (clienteError) {
      return jsonResponse(500, {
        success: false,
        error: `Error al buscar el cliente: ${clienteError.message}`,
      });
    }

    if (!cliente) {
      return jsonResponse(404, {
        success: false,
        error: 'Cliente no encontrado. Debe registrarse primero.',
      });
    }

    // --------------------------------------------------------
    // 3. Buscar recurso
    // --------------------------------------------------------

    const { data: recurso, error: recursoError } = await supabase
      .from('recurso')
      .select(
        'id_recurso, nombre, tipo_recurso, deporte, capacidad, estado, activo'
      )
      .eq('id_recurso', body.id_recurso)
      .maybeSingle();

    if (recursoError) {
      return jsonResponse(500, {
        success: false,
        error: `Error al buscar el recurso: ${recursoError.message}`,
      });
    }

    if (!recurso) {
      return jsonResponse(404, {
        success: false,
        error: 'El recurso solicitado no existe.',
      });
    }

    if (!recurso.activo || recurso.estado !== 'DISPONIBLE') {
      return jsonResponse(409, {
        success: false,
        error: 'El recurso no está disponible para realizar reservas.',
      });
    }

    // --------------------------------------------------------
    // 4. Buscar tarifa automáticamente
    // --------------------------------------------------------
    // n8n NO manda el precio.
    // El backend determina el precio según:
    // recurso + tipo de cliente + duración.
    // --------------------------------------------------------

    const { data: tarifa, error: tarifaError } = await supabase
      .from('tarifa')
      .select(
        'id_tarifa, id_recurso, tipo_cliente, duracion_minutos, precio, vigente_desde, vigente_hasta, activo'
      )
      .eq('id_recurso', body.id_recurso)
      .eq('tipo_cliente', cliente.tipo_cliente)
      .eq('duracion_minutos', body.duracion_minutos)
      .eq('activo', true)
      .lte('vigente_desde', body.fecha_reserva)
      .or(
        `vigente_hasta.is.null,vigente_hasta.gte.${body.fecha_reserva}`
      )
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tarifaError) {
      return jsonResponse(500, {
        success: false,
        error: `Error al buscar la tarifa: ${tarifaError.message}`,
      });
    }

    if (!tarifa) {
      return jsonResponse(409, {
        success: false,
        error:
          `No existe una tarifa activa para ${cliente.tipo_cliente} ` +
          `de ${body.duracion_minutos} minutos en el recurso solicitado.`,
      });
    }

    const costoReserva = Number(tarifa.precio);

    if (!Number.isFinite(costoReserva)) {
      return jsonResponse(500, {
        success: false,
        error: 'La tarifa configurada para la reserva no es válida.',
      });
    }

    // --------------------------------------------------------
    // 5. Crear reserva mediante RPC
    // --------------------------------------------------------
    // La RPC vuelve a verificar:
    // - recurso disponible
    // - conflictos con otras reservas
    // - reservas pendientes todavía vigentes
    // - bloqueos administrativos
    // - concurrencia
    //
    // Además establece automáticamente:
    // fecha_expiracion_pago = NOW() + 5 minutos
    // --------------------------------------------------------

    const { data: resultadoRpc, error: rpcError } = await supabase.rpc(
      'crear_reserva_recurso',
      {
        p_id_cliente: cliente.id_cliente,
        p_id_recurso: body.id_recurso,
        p_fecha_reserva: body.fecha_reserva,
        p_hora_inicio: body.hora_inicio,
        p_hora_fin: horaFin,
        p_duracion_minutos: body.duracion_minutos,
        p_costo_reserva: costoReserva,
      }
    );

    if (rpcError) {
      return jsonResponse(500, {
        success: false,
        error: `Error al crear la reserva: ${rpcError.message}`,
      });
    }

    if (!resultadoRpc?.success) {
      const errorCode = resultadoRpc?.error_code;

      let status = 409;

      if (
        errorCode === 'DURACION_INVALIDA' ||
        errorCode === 'HORARIO_INVALIDO'
      ) {
        status = 400;
      }

      if (errorCode === 'RECURSO_NO_DISPONIBLE') {
        status = 409;
      }

      return jsonResponse(status, {
        success: false,
        error:
          resultadoRpc?.message ||
          'No fue posible crear la reserva.',
        data: resultadoRpc,
      });
    }

    const idReserva = resultadoRpc.id_reserva;

    // --------------------------------------------------------
    // 6. Obtener la reserva creada
    // --------------------------------------------------------

    const { data: reserva, error: reservaError } = await supabase
      .from('reserva')
      .select(
        `
        id_reserva,
        id_cliente,
        id_recurso,
        fecha_reserva,
        hora_inicio,
        hora_fin,
        duracion_minutos,
        estado_reserva,
        costo_reserva,
        fecha_expiracion_pago,
        created_at,
        updated_at
        `
      )
      .eq('id_reserva', idReserva)
      .single();

    if (reservaError || !reserva) {
      return jsonResponse(500, {
        success: false,
        error:
          'La reserva fue creada pero no se pudo recuperar su información.',
      });
    }

    // --------------------------------------------------------
    // 7. Respuesta para n8n
    // --------------------------------------------------------

    return jsonResponse(200, {
      success: true,
      data: {
        ...reserva,
        cliente: {
          id_cliente: cliente.id_cliente,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          telefono: cliente.telefono,
          chat_id: cliente.chat_id,
          tipo_cliente: cliente.tipo_cliente,
        },
        recurso: {
          id_recurso: recurso.id_recurso,
          nombre: recurso.nombre,
          tipo_recurso: recurso.tipo_recurso,
          deporte: recurso.deporte,
          capacidad: recurso.capacidad,
        },
        tarifa: {
          id_tarifa: tarifa.id_tarifa,
          tipo_cliente: tarifa.tipo_cliente,
          duracion_minutos: tarifa.duracion_minutos,
          precio: costoReserva,
        },
      },
      message:
        `Reserva creada exitosamente para ${cliente.nombre} ${cliente.apellido}. ` +
        `Tiene 5 minutos para completar el pago.`,
    });
  } catch (e) {
    return jsonResponse(500, {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : 'Error interno del servidor',
    });
  }
}

// ============================================================
// PUT — Confirmar / cancelar reserva desde n8n
// ============================================================

export async function PUT(request: NextRequest) {
  try {
    if (!validateApiKey(request)) {
      return jsonResponse(401, {
        success: false,
        error: 'API Key no válida',
      });
    }

    const body: ActualizarReservaExternalRequest =
      await request.json();

    // --------------------------------------------------------
    // 1. Validar datos
    // --------------------------------------------------------

    if (!body.chat_id || !body.id_reserva || !body.estado_reserva) {
      return jsonResponse(400, {
        success: false,
        error:
          'Campos requeridos: chat_id, id_reserva, estado_reserva',
      });
    }

    if (
      !['pendiente', 'confirmada', 'cancelada'].includes(
        body.estado_reserva
      )
    ) {
      return jsonResponse(400, {
        success: false,
        error:
          'estado_reserva debe ser: pendiente, confirmada o cancelada',
      });
    }

    const supabase = getSupabaseClient();

    // --------------------------------------------------------
    // 2. Buscar cliente por chat_id
    // --------------------------------------------------------

    const { data: cliente, error: clienteError } = await supabase
      .from('cliente')
      .select('id_cliente, nombre, apellido, telefono, chat_id')
      .eq('chat_id', body.chat_id)
      .maybeSingle();

    if (clienteError) {
      return jsonResponse(500, {
        success: false,
        error: `Error al buscar el cliente: ${clienteError.message}`,
      });
    }

    if (!cliente) {
      return jsonResponse(404, {
        success: false,
        error: 'Cliente no encontrado.',
      });
    }

    // --------------------------------------------------------
    // 3. Buscar reserva
    // --------------------------------------------------------

    const { data: reservaExistente, error: buscarError } =
      await supabase
        .from('reserva')
        .select(
          `
          id_reserva,
          id_cliente,
          id_recurso,
          fecha_reserva,
          hora_inicio,
          hora_fin,
          duracion_minutos,
          estado_reserva,
          costo_reserva,
          fecha_expiracion_pago
          `
        )
        .eq('id_reserva', body.id_reserva)
        .maybeSingle();

    if (buscarError) {
      return jsonResponse(500, {
        success: false,
        error: `Error al buscar la reserva: ${buscarError.message}`,
      });
    }

    if (!reservaExistente) {
      return jsonResponse(404, {
        success: false,
        error: 'Reserva no encontrada.',
      });
    }

    // --------------------------------------------------------
    // 4. Verificar propiedad de la reserva
    // --------------------------------------------------------
    // Un cliente NO puede modificar la reserva de otro cliente.
    // --------------------------------------------------------

    if (reservaExistente.id_cliente !== cliente.id_cliente) {
      return jsonResponse(403, {
        success: false,
        error: 'No tenés permisos para modificar esta reserva.',
      });
    }

    // --------------------------------------------------------
    // 5. Validar transición de estado
    // --------------------------------------------------------

    if (
      body.estado_reserva === 'confirmada' &&
      reservaExistente.estado_reserva !== 'pendiente'
    ) {
      return jsonResponse(409, {
        success: false,
        error:
          'Solo se puede confirmar una reserva que está pendiente.',
      });
    }

    if (
      body.estado_reserva === 'cancelada' &&
      reservaExistente.estado_reserva === 'cancelada'
    ) {
      return jsonResponse(409, {
        success: false,
        error: 'La reserva ya está cancelada.',
      });
    }

    if (
      body.estado_reserva === 'pendiente' &&
      reservaExistente.estado_reserva !== 'pendiente'
    ) {
      return jsonResponse(409, {
        success: false,
        error:
          'No se puede volver una reserva existente al estado pendiente.',
      });
    }

    // --------------------------------------------------------
    // 6. Actualizar estado
    // --------------------------------------------------------

    const nuevosDatos: {
      estado_reserva: 'pendiente' | 'confirmada' | 'cancelada';
      updated_at: string;
      fecha_expiracion_pago?: string | null;
    } = {
      estado_reserva: body.estado_reserva,
      updated_at: new Date().toISOString(),
    };

    // Si se confirma o cancela, deja de tener sentido mantener
    // la expiración de pago pendiente.
    if (
      body.estado_reserva === 'confirmada' ||
      body.estado_reserva === 'cancelada'
    ) {
      nuevosDatos.fecha_expiracion_pago = null;
    }

    const { data: reservaActualizada, error: actualizarError } =
      await supabase
        .from('reserva')
        .update(nuevosDatos)
        .eq('id_reserva', body.id_reserva)
        .eq('id_cliente', cliente.id_cliente)
        .select(
          `
          id_reserva,
          id_cliente,
          id_recurso,
          fecha_reserva,
          hora_inicio,
          hora_fin,
          duracion_minutos,
          estado_reserva,
          costo_reserva,
          fecha_expiracion_pago,
          created_at,
          updated_at
          `
        )
        .single();

    if (actualizarError) {
      return jsonResponse(500, {
        success: false,
        error:
          `Error al actualizar el estado de la reserva: ` +
          actualizarError.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      data: {
        ...reservaActualizada,
        cliente: {
          id_cliente: cliente.id_cliente,
          nombre: cliente.nombre,
          apellido: cliente.apellido,
          telefono: cliente.telefono,
          chat_id: cliente.chat_id,
        },
      },
      message:
        `Estado de reserva actualizado a: ${body.estado_reserva}`,
    });
  } catch (e) {
    return jsonResponse(500, {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : 'Error interno del servidor',
    });
  }
}