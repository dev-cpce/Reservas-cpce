import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { logSystemEvent } from '@/lib/logger';
import { ApiResponse, LeerConversacionResponse } from '@/types/api';

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

// POST: marca la conversación como leída (no_leidos = 0) al abrir el chat.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const perfil = await obtenerPerfil();

    if (!perfil) {
      return jsonResponse(401, { success: false, error: 'No autenticado' });
    }

    const permitido = await tienePermisoUsuario('mensajes.ver');

    if (!permitido) {
      return jsonResponse(403, {
        success: false,
        error: 'No tenés permisos para ver los mensajes.',
      });
    }

    const { id } = await params;
    const idConversacion = Number(id);

    if (!Number.isInteger(idConversacion) || idConversacion <= 0) {
      return jsonResponse(400, { success: false, error: 'El id de la conversación es inválido' });
    }

    const supabase = getSupabaseClient();

    const { data: conversacion, error } = await supabase
      .from('conversacion')
      .update({ no_leidos: 0, updated_at: new Date().toISOString() })
      .eq('id', idConversacion)
      .select('id, no_leidos')
      .maybeSingle();

    if (error) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'CONVERSACION_LEER_ERROR',
        message: error.message,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion },
      });

      return jsonResponse(500, { success: false, error: 'Error al marcar la conversación como leída' });
    }

    if (!conversacion) {
      return jsonResponse(404, { success: false, error: 'La conversación no existe' });
    }

    return jsonResponse<LeerConversacionResponse>(200, {
      success: true,
      data: { no_leidos: conversacion.no_leidos ?? 0 },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
