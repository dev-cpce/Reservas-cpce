import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

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

    return NextResponse.json(pagos);
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
  try {
    const permitido = await tienePermisoUsuario(
      'pagos.confirmar'
    );

    if (!permitido) {
      return NextResponse.json(
        {
          error:
            'No tenés permisos para confirmar pagos.'
        },
        { status: 403 }
      );
    }

    const body = await request.json();

    const {
      id_reserva,
      monto,
      estado_pago,
      mp_id
    } = body;

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
      return NextResponse.json(
        {
          error:
            pagoError.message ||
            'Error al crear el pago'
        },
        { status: 500 }
      );
    }

    if (
      reserva.estado_reserva === 'pendiente'
    ) {
      const { error: updateError } =
        await supabase
          .from('reserva')
          .update({
            estado_reserva: 'confirmada'
          })
          .eq(
            'id_reserva',
            id_reserva
          );

      if (updateError) {
        return NextResponse.json(
          {
            error:
              updateError.message ||
              'Pago creado, pero no se pudo actualizar la reserva'
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(pago);
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

// PUT - Actualizar estado de pago
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      id_pago,
      estado_pago,
      mp_id
    } = body;

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
      return NextResponse.json(
        {
          error: esCambioDeEstado
            ? 'No tenés permisos para confirmar pagos.'
            : 'No tenés permisos para editar pagos.'
        },
        { status: 403 }
      );
    }

    const supabase = getSupabaseClient();

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
      return NextResponse.json(
        {
          error:
            error.message ||
            'Error al actualizar el pago'
        },
        { status: 500 }
      );
    }

    return NextResponse.json(pago);
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