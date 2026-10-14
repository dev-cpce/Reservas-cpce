import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { logSystemEvent } from '@/lib/logger';
import { ActualizarModoConversacionRequest, ApiResponse, ModoConversacionResponse } from '@/types/api';

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

// POST: cambia el modo de la conversación. Lo usa el botón "Reactivar asistente"
// (vuelve a bot) y, potencialmente, un pase manual a humano desde la UI.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const perfil = await obtenerPerfil();

    if (!perfil) {
      return jsonResponse(401, { success: false, error: 'No autenticado' });
    }

    const permitido = await tienePermisoUsuario('mensajes.enviar');

    if (!permitido) {
      await logSystemEvent({
        level: 'warning',
        source: 'mensajes-internal',
        event: 'CONVERSACION_MODO_SIN_PERMISO',
        userId: perfil.id,
      });

      return jsonResponse(403, {
        success: false,
        error: 'No tenés permisos para cambiar el modo de la conversación.',
      });
    }

    const { id } = await params;
    const idConversacion = Number(id);

    if (!Number.isInteger(idConversacion) || idConversacion <= 0) {
      return jsonResponse(400, { success: false, error: 'El id de la conversación es inválido' });
    }

    let body: ActualizarModoConversacionRequest;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { success: false, error: 'El body debe ser un objeto JSON' });
    }

    const modo = body?.modo;

    if (modo !== 'bot' && modo !== 'humano') {
      return jsonResponse(400, {
        success: false,
        error: 'El campo modo debe ser "bot" o "humano"',
      });
    }

    const supabase = getSupabaseClient();

    const { data: conversacion, error } = await supabase
      .from('conversacion')
      .update({ modo, updated_at: new Date().toISOString() })
      .eq('id', idConversacion)
      .select('id, modo')
      .maybeSingle();

    if (error) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'CONVERSACION_MODO_ERROR',
        message: error.message,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion },
      });

      return jsonResponse(500, {
        success: false,
        error: 'Error al actualizar el modo de la conversación',
      });
    }

    if (!conversacion) {
      return jsonResponse(404, { success: false, error: 'La conversación no existe' });
    }

    await logSystemEvent({
      level: 'info',
      source: 'mensajes-internal',
      event: modo === 'humano' ? 'CONVERSACION_PASA_A_HUMANO' : 'CONVERSACION_REACTIVA_BOT',
      userId: perfil.id,
      metadata: { id_conversacion: idConversacion },
    });

    return jsonResponse<ModoConversacionResponse>(200, {
      success: true,
      data: { modo: (conversacion.modo as 'bot' | 'humano') ?? modo },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
