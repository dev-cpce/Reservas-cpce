import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ApiResponse } from '@/types/api';

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

export async function GET(request: NextRequest) {
  try {
    // Validar API Key
    if (!validateApiKey(request)) {
      return NextResponse.json<ApiResponse>({
        success: false,
        error: 'API Key no válida'
      }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get('tipo'); // 'recursos', 'deportes', 'horarios', 'precios'

    switch (tipo) {
      case 'recursos':
        const { data: recursos } = await supabase
          .from('recurso')
          .select('id_recurso, nombre, tipo_recurso, deporte, estado')
          .eq('activo', true)
          .eq('estado', 'DISPONIBLE')
          .order('nombre');

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            recursos: recursos || [],
            total: recursos?.length || 0
          }
        });

      case 'deportes':
        const { data: deportes } = await supabase
          .from('recurso')
          .select('deporte')
          .eq('activo', true)
          .eq('estado', 'DISPONIBLE')
          .not('deporte', 'is', null);

        const deportesUnicos = [...new Set(deportes?.map(d => d.deporte) || [])];

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            deportes: deportesUnicos,
            total: deportesUnicos.length
          }
        });

      case 'horarios':
        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            horarios_disponibles: [
              '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
              '14:00', '15:00', '16:00', '17:00', '18:00', '19:00',
              '20:00', '21:00'
            ],
            horario_apertura: '08:00',
            horario_cierre: '22:00',
            duracion_minima: '1 hora'
          }
        });

      case 'precios':
        const { data: precios } = await supabase
          .from('tarifa')
          .select('precio, recurso!inner(deporte)')
          .eq('activo', true)
          .eq('recurso.activo', true);

        const preciosPorDeporte = precios?.reduce((acc, tarifa) => {
          const recurso = Array.isArray(tarifa.recurso) ? tarifa.recurso[0] : tarifa.recurso;
          const deporte = recurso?.deporte;
          if (!deporte) return acc;
          if (!acc[deporte]) {
            acc[deporte] = {
              precio_min: tarifa.precio,
              precio_max: tarifa.precio,
              precio_promedio: tarifa.precio
            };
          } else {
            acc[deporte].precio_min = Math.min(acc[deporte].precio_min, tarifa.precio);
            acc[deporte].precio_max = Math.max(acc[deporte].precio_max, tarifa.precio);
          }
          return acc;
        }, {} as Record<string, { precio_min: number; precio_max: number; precio_promedio: number }>);

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            precios_por_deporte: preciosPorDeporte || {},
            moneda: 'ARS'
          }
        });

      default:
        // Información general
        const [
          { data: totalRecursos },
          { data: totalClientes },
          { data: reservasHoy }
        ] = await Promise.all([
          supabase
            .from('recurso')
            .select('id_recurso', { count: 'exact' })
            .eq('activo', true)
            .eq('estado', 'DISPONIBLE'),
          supabase
            .from('cliente')
            .select('id_cliente', { count: 'exact' }),
          supabase
            .from('reserva')
            .select('id_reserva', { count: 'exact' })
            .eq('fecha_reserva', new Date().toISOString().split('T')[0])
        ]);

        return NextResponse.json<ApiResponse>({
          success: true,
          data: {
            informacion_general: {
              recursos_disponibles: totalRecursos?.length || 0,
              clientes_registrados: totalClientes?.length || 0,
              reservas_hoy: reservasHoy?.length || 0,
              horario_atencion: '08:00 - 22:00',
              estado_sistema: 'Operativo'
            },
            endpoints_disponibles: [
              'GET /api/external/info?tipo=recursos - Lista de recursos',
              'GET /api/external/info?tipo=deportes - Tipos de deporte',
              'GET /api/external/info?tipo=horarios - Horarios disponibles',
              'GET /api/external/info?tipo=precios - Precios por deporte',
              'POST /api/external/disponibilidad - Consultar disponibilidad',
              'POST /api/external/reservas - Crear reserva'
            ]
          }
        });
    }

  } catch (error) {
    return NextResponse.json<ApiResponse>({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor'
    }, { status: 500 });
  }
}