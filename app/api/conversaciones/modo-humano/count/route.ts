import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { logSystemEvent } from '@/lib/logger';
import { ApiResponse, ConteoModoHumanoResponse } from '@/types/api';

// Se usa el cliente admin para leer conversacion: la autorización real pasa por
// obtenerPerfil()/tienePermisoUsuario(), no por RLS de esta tabla.
function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Faltan variables de entorno de Supabase');
  }

  return createClient(url, key);
}

function jsonResponse<T>(status: number, payload: ApiResponse<T>) {
  return NextResponse.json(payload, { status });
}

// GET: cantidad de conversaciones en modo humano, para el indicador global del
// panel (Navbar). Solo el conteo (head: true) para que sea liviano y pueda
// consultarse seguido sin traer filas de datos.
export async function GET() {
  try {
    const perfil = await obtenerPerfil();

    if (!perfil) {
      return jsonResponse(401, { success: false, error: 'No autenticado' });
    }

    const permitido = await tienePermisoUsuario('mensajes.ver');

    if (!permitido) {
      return jsonResponse(403, {
        success: false,
        error: 'No tenés permisos para ver la bandeja de mensajes.',
      });
    }

    const supabase = getSupabaseClient();

    const { count, error } = await supabase
      .from('conversacion')
      .select('id', { count: 'exact', head: true })
      .eq('modo', 'humano');

    if (error) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'CONVERSACIONES_CONTAR_MODO_HUMANO_ERROR',
        message: error.message,
        userId: perfil.id,
      });

      return jsonResponse(500, {
        success: false,
        error: 'Error al contar conversaciones en modo humano',
      });
    }

    return jsonResponse<ConteoModoHumanoResponse>(200, {
      success: true,
      data: { count: count ?? 0 },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
