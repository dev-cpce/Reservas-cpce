import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { logSystemEvent } from '@/lib/logger';

function getSupabaseClient() {
  const cookieStore = cookies();

  return createRouteHandlerClient({
    cookies: () => cookieStore
  });
}

// GET - Obtener todos los pagos
export async function GET() {
  try {
    const permitido = await tienePermisoUsuario('pagos.ver');

    if (!permitido) {
      return NextResponse.json(
        { error: 'No tenés permisos para ver los pagos.' },
        { status: 403 }
      );
    }

    const supabase = getSupabaseClient();

    const { data: pagos, error } = await supabase
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

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message || 'Error al obtener los pagos'
        },
        { status: 500 }
      );
    }

    // Solo se expone un booleano; el rol puede no leer la tabla reserva por RLS.
    const idsAprobados = (pagos ?? [])
      .filter((p) => p.estado_pago === 'aprobado')
      .map((p) => p.id_reserva);
    const reservasCanceladas = new Set<number>();

    if (
      idsAprobados.length > 0 &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );
      const { data: canceladas } = await admin
        .from('reserva')
        .select('id_reserva')
        .in('id_reserva', idsAprobados)
        .eq('estado_reserva', 'cancelada');

      (canceladas ?? []).forEach((r) =>
        reservasCanceladas.add(r.id_reserva)
      );
    }

    return NextResponse.json(
      (pagos ?? []).map((p) => ({
        ...p,
        reserva_cancelada:
          p.estado_pago === 'aprobado' &&
          reservasCanceladas.has(p.id_reserva),
      }))
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor'
      },
      { status: 500 }
    );
  }
}

// POST - Crear nuevo pago
export async function POST(request: NextRequest) {
  const requestId = `PAG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'web' };
  let userId: string | null = null;

  try {
    const permitido = await tienePermisoUsuario(
      'pagos.confirmar'
    );

    if (!permitido) {
      await logSystemEvent({
        level: 'warning',
        source: 'pagos',
        event: 'PAGO_UNAUTHORIZED',
        message: 'Intento de registrar un pago sin permisos',
        requestId,
        metadata: meta,
      });
      return NextResponse.json(
        {
          error:
            'No tenés permisos para confirmar pagos.'
        },
        { status: 403 }
      );
    }

    userId = (await obtenerPerfil())?.id ?? null;
    const body = await request.json();

    const {
      id_reserva,
      monto,
      estado_pago,
      mp_id
    } = body;

    meta = {
      origen: 'web',
      id_reserva,
      monto,
      estado_pago_nuevo: estado_pago,
      mp_id: mp_id || null,
    };
    // Validaciones
    if (!id_reserva || !monto || !estado_pago) {
      return NextResponse.json(
        {
          error:
            'Faltan campos requeridos: id_reserva, monto, estado_pago'
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Verificar que la reserva existe y obtener su estado actual
    const { data: reserva, error: reservaError } =
      await supabase
        .from('reserva')
        .select(
          'id_reserva, estado_reserva'
        )
        .eq('id_reserva', id_reserva)
        .single();

    if (reservaError || !reserva) {
      return NextResponse.json(
        {
          error:
            reservaError?.message ||
            'La reserva especificada no existe'
        },
        { status: 404 }
      );
    }

    const { data: pago, error: pagoError } =
      await supabase
        .from('pago')
        .insert({
          id_reserva,
          monto,
          estado_pago,
          mp_id: mp_id || null,
          fecha_pago: new Date().toISOString()
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

    if (pagoError) {
      await logSystemEvent({
        level: 'error',
        source: 'pagos',
        event: 'PAGO_ERROR',
        message: pagoError.message || 'Error al crear el pago',
        requestId,
        userId,
        metadata: { ...meta, estado_reserva: reserva.estado_reserva },
      });
      return NextResponse.json(
        {
          error:
            pagoError.message ||
            'Error al crear el pago'
        },
        { status: 500 }
      );
    }

    let estadoReservaNuevo: string = reserva.estado_reserva;

    // Solo un pago aprobado confirma la reserva; uno pendiente no debe hacerlo.
    if (
      estado_pago === 'aprobado' &&
      reserva.estado_reserva === 'pendiente'
    ) {
      const { data: reservaConfirmada, error: updateError } =
        await supabase
          .from('reserva')
          .update({
            estado_reserva: 'confirmada'
          })
          .eq(
            'id_reserva',
            id_reserva
          )
          // Evita pisar un cambio concurrente (p. ej. autocancelación).
          .eq('estado_reserva', 'pendiente')
          .select('id_reserva');

      if (updateError || !reservaConfirmada || reservaConfirmada.length === 0) {
        const mensajeError =
          updateError?.message ||
          'Pago creado, pero no se pudo actualizar la reserva';

        // El pago ya existe pero la reserva quedó pendiente: estado inconsistente.
        await logSystemEvent({
          level: 'critical',
          source: 'pagos',
          event: 'PAGO_RESERVA_SYNC_ERROR',
          message: mensajeError,
          requestId,
          userId,
          metadata: {
            ...meta,
            id_pago: pago.id_pago,
            estado_reserva: reserva.estado_reserva,
            estado_reserva_esperado: 'confirmada',
          },
        });
        return NextResponse.json(
          {
            error: mensajeError
          },
          { status: 500 }
        );
      }

      estadoReservaNuevo = 'confirmada';
    }

    await logSystemEvent({
      level: 'info',
      source: 'pagos',
      event: 'PAGO_CREATED',
      message: 'Pago registrado correctamente',
      requestId,
      userId,
      metadata: {
        ...meta,
        id_pago: pago.id_pago,
        estado_reserva_anterior: reserva.estado_reserva,
        estado_reserva_nuevo: estadoReservaNuevo,
      },
    });

    return NextResponse.json(pago);
  } catch (error) {
    await logSystemEvent({
      level: 'error',
      source: 'pagos',
      event: 'PAGO_ERROR',
      message: error instanceof Error ? error.message : 'Error interno del servidor',
      requestId,
      userId,
      metadata: meta,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor'
      },
      { status: 500 }
    );
  }
}

// PUT - Actualizar estado de pago
export async function PUT(request: NextRequest) {
  const requestId = `PAG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'web' };
  let userId: string | null = null;

  try {
    const body = await request.json();

    const {
      id_pago,
      estado_pago,
      mp_id
    } = body;

    meta = { origen: 'web', id_pago, estado_pago_nuevo: estado_pago };
    if (!id_pago || !estado_pago) {
      return NextResponse.json(
        {
          error:
            'Faltan campos requeridos: id_pago, estado_pago'
        },
        { status: 400 }
      );
    }

    /*
     * Confirmar/cancelar un pago pendiente utiliza
     * el permiso pagos.confirmar.
     *
     * La edición general del pago (por ejemplo MP ID)
     * utiliza pagos.editar.
     */
    const esCambioDeEstado =
      estado_pago === 'aprobado' ||
      estado_pago === 'cancelado';

    let permitido = false;

    if (esCambioDeEstado) {
      permitido = await tienePermisoUsuario(
        'pagos.confirmar'
      );
    } else {
      permitido = await tienePermisoUsuario(
        'pagos.editar'
      );
    }

    if (!permitido) {
      await logSystemEvent({
        level: 'warning',
        source: 'pagos',
        event: 'PAGO_UNAUTHORIZED',
        message: 'Intento de modificar un pago sin permisos',
        requestId,
        metadata: meta,
      });
      return NextResponse.json(
        {
          error: esCambioDeEstado
            ? 'No tenés permisos para confirmar pagos.'
            : 'No tenés permisos para editar pagos.'
        },
        { status: 403 }
      );
    }

    userId = (await obtenerPerfil())?.id ?? null;

    const supabase = getSupabaseClient();

    const { data: pagoAnterior } = await supabase
      .from('pago')
      .select('estado_pago')
      .eq('id_pago', id_pago)
      .maybeSingle();

    meta = { ...meta, estado_pago_anterior: pagoAnterior?.estado_pago ?? null };
    const updateData: {
      estado_pago: string;
      mp_id?: string | null;
    } = {
      estado_pago
    };

    if (mp_id !== undefined) {
      updateData.mp_id = mp_id;
    }

    const { data: pago, error } =
      await supabase
        .from('pago')
        .update(updateData)
        .eq('id_pago', id_pago)
        .select(`
          id_pago,
          id_reserva,
          monto,
          estado_pago,
          mp_id,
          fecha_pago
        `)
        .single();

    if (error) {
      await logSystemEvent({
        level: 'error',
        source: 'pagos',
        event: 'PAGO_ERROR',
        message: error.message || 'Error al actualizar el pago',
        requestId,
        userId,
        metadata: meta,
      });
      return NextResponse.json(
        {
          error:
            error.message ||
            'Error al actualizar el pago'
        },
        { status: 500 }
      );
    }

    await logSystemEvent({
      level: 'info',
      source: 'pagos',
      event: 'PAGO_STATUS_CHANGED',
      message: `Pago actualizado a ${estado_pago}`,
      requestId,
      userId,
      metadata: { ...meta, id_reserva: pago.id_reserva, monto: pago.monto },
    });

    return NextResponse.json(pago);
  } catch (error) {
    await logSystemEvent({
      level: 'error',
      source: 'pagos',
      event: 'PAGO_ERROR',
      message: error instanceof Error ? error.message : 'Error interno del servidor',
      requestId,
      userId,
      metadata: meta,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor'
      },
      { status: 500 }
    );
  }
}