import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.N8N_API_KEY;
}

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export async function GET(request: NextRequest) {
  try {
    // ========================================================
    // 1. Validar API Key
    // ========================================================

    if (!validateApiKey(request)) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'API Key no válida',
        },
        { status: 401 }
      );
    }

    // ========================================================
    // 2. Obtener parámetros
    // ========================================================

    const { searchParams } = new URL(request.url);

    const chatId = searchParams.get('chat_id');

    const todasLasReservas =
      searchParams.get('todas') === 'true';

    if (!chatId) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error: 'El parámetro chat_id es requerido',
        },
        { status: 400 }
      );
    }

    // ========================================================
    // 3. Obtener fecha actual de Argentina
    // ========================================================

    const ahora = new Date();

    const fechaArgentina = new Date(
      ahora.getTime() - 3 * 60 * 60 * 1000
    );

    const fechaActual = fechaArgentina
      .toISOString()
      .split('T')[0];

    // ========================================================
    // 4. Buscar cliente
    // ========================================================

    const { data: cliente, error: clienteError } =
      await supabase
        .from('cliente')
        .select(
          `
          id_cliente,
          nombre,
          apellido,
          telefono,
          chat_id
          `
        )
        .eq('chat_id', chatId)
        .single();

    if (clienteError) {
      if (clienteError.code === 'PGRST116') {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error:
              'Cliente no encontrado con el chat_id proporcionado',
          },
          { status: 404 }
        );
      }

      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            `Error al buscar cliente: ${clienteError.message}`,
        },
        { status: 500 }
      );
    }

    // ========================================================
    // 5. Buscar reservas del cliente
    // ========================================================

    let query = supabase
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
      .eq('id_cliente', cliente.id_cliente)
      .in('estado_reserva', ['confirmada', 'pendiente']);

    // --------------------------------------------------------
    // Si no se solicitan todas, mostrar desde hoy en adelante
    // --------------------------------------------------------

    if (!todasLasReservas) {
      query = query.gte(
        'fecha_reserva',
        fechaActual
      );
    }

    const { data: reservas, error: reservasError } =
      await query
        .order('fecha_reserva', {
          ascending: true,
        })
        .order('hora_inicio', {
          ascending: true,
        });

    if (reservasError) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            `Error al consultar las reservas: ${reservasError.message}`,
        },
        { status: 500 }
      );
    }

    // ========================================================
    // 6. Si no hay reservas
    // ========================================================

    if (!reservas || reservas.length === 0) {
      return NextResponse.json<ApiResponse>(
        {
          success: true,
          data: {
            cliente: {
              id: cliente.id_cliente,
              chat_id: cliente.chat_id,
              nombre: cliente.nombre,
              apellido: cliente.apellido,
              telefono: cliente.telefono,
            },
            total_reservas: 0,
            reservas: [],
          },
        },
        { status: 200 }
      );
    }

    // ========================================================
    // 7. Obtener IDs de recursos
    // ========================================================

    const recursoIds = [
      ...new Set(
        reservas
          .map((reserva) => reserva.id_recurso)
          .filter(
            (id): id is number =>
              typeof id === 'number'
          )
      ),
    ];

    // ========================================================
    // 8. Buscar recursos
    // ========================================================

    let recursosData: Array<{
      id_recurso: number;
      nombre: string;
      tipo_recurso: string | null;
      deporte: string | null;
      capacidad: number | null;
      estado: string | null;
      activo: boolean | null;
    }> = [];

    if (recursoIds.length > 0) {
      const {
        data,
        error: recursosError,
      } = await supabase
        .from('recurso')
        .select(
          `
          id_recurso,
          nombre,
          tipo_recurso,
          deporte,
          capacidad,
          estado,
          activo
          `
        )
        .in('id_recurso', recursoIds);

      if (recursosError) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error:
              `Error al consultar los recursos: ${recursosError.message}`,
          },
          { status: 500 }
        );
      }

      recursosData = data || [];
    }

    // ========================================================
    // 9. Crear mapa de recursos
    // ========================================================

    const recursosMap = recursosData.reduce(
      (acc, recurso) => {
        acc[recurso.id_recurso] = recurso;
        return acc;
      },
      {} as Record<
        number,
        {
          id_recurso: number;
          nombre: string;
          tipo_recurso: string | null;
          deporte: string | null;
          capacidad: number | null;
          estado: string | null;
          activo: boolean | null;
        }
      >
    );

    // ========================================================
    // 10. Formatear reservas
    // ========================================================

    const reservasFormateadas = reservas.map(
      (reserva) => {
        const recursoInfo =
          reserva.id_recurso !== null
            ? recursosMap[reserva.id_recurso]
            : null;

        return {
          nro_reserva: reserva.id_reserva,

          fecha: reserva.fecha_reserva,

          hora_inicio: reserva.hora_inicio,

          hora_fin: reserva.hora_fin,

          duracion_minutos:
            reserva.duracion_minutos,

          id_recurso:
            reserva.id_recurso,

          recurso: recursoInfo
            ? {
                id_recurso:
                  recursoInfo.id_recurso,

                nombre:
                  recursoInfo.nombre,

                tipo_recurso:
                  recursoInfo.tipo_recurso,

                deporte:
                  recursoInfo.deporte,

                capacidad:
                  recursoInfo.capacidad,

                estado:
                  recursoInfo.estado,

                activo:
                  recursoInfo.activo,
              }
            : null,

          costo: reserva.costo_reserva,

          estado: reserva.estado_reserva,

          fecha_expiracion_pago:
            reserva.fecha_expiracion_pago,
        };
      }
    );

    // ========================================================
    // 11. Respuesta
    // ========================================================

    return NextResponse.json<ApiResponse>(
      {
        success: true,

        data: {
          cliente: {
            id: cliente.id_cliente,
            chat_id: cliente.chat_id,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            telefono: cliente.telefono,
          },

          total_reservas:
            reservasFormateadas.length,

          reservas:
            reservasFormateadas,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor',
      },
      { status: 500 }
    );
  }
}