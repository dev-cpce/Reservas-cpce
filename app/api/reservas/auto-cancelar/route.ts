import { NextRequest, NextResponse } from 'next/server';
import { cancelarReservasPendientesVencidas } from '../actions';
import { autorizarAutoCancelacion } from '@/lib/auth/autorizarAutoCancelacion';

// Evita que Next.js cachee la respuesta: debe ejecutarse en cada invocación.
export const dynamic = 'force-dynamic';

// Cancela reservas pendientes vencidas. Lo invoca un planificador externo
// (Authorization: Bearer CRON_SECRET) o el panel con sesión activa.
async function ejecutar(request: NextRequest) {
  if (!(await autorizarAutoCancelacion(request))) {
    return NextResponse.json(
      { success: false, canceladas: 0, error: 'No autorizado' },
      { status: 401 }
    );
  }

  try {
    const resultado = await cancelarReservasPendientesVencidas();

    return NextResponse.json(resultado);

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        canceladas: 0,
        error: error instanceof Error ? error.message : 'Error desconocido'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return ejecutar(request);
}

// GET permite que un planificador HTTP simple (p. ej. Vercel Cron) ejecute la tarea.
export async function GET(request: NextRequest) {
  return ejecutar(request);
}
