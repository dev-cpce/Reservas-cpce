import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logSystemEvent } from '@/lib/logger';
import { validarApiKeyN8n } from '@/lib/auth/apiKeyN8n';
import { ApiResponse, ModoConversacionResponse } from '@/types/api';

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

// GET: el asistente consulta el modo actual antes de responder (si es "humano", no contesta).
export async function GET(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  try {
    if (!validarApiKeyN8n(request)) {
      await logSystemEvent({
        level: 'warning',
        source: 'mensajes-external',
        event: 'CONVERSACION_MODO_UNAUTHORIZED',
        message: 'Intento de consultar modo con API Key inválida',
        requestId,
      });

      return jsonResponse(401, { success: false, error: 'API Key no válida' });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chat_id')?.trim() ?? '';

    if (!chatId) {
      return jsonResponse(400, { success: false, error: 'El parámetro chat_id es requerido' });
    }

    const supabase = getSupabaseClient();

    const { data: conversacion, error } = await supabase
      .from('conversacion')
      .select('modo')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (error) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-external',
        event: 'CONVERSACION_MODO_ERROR',
        message: error.message,
        requestId,
        metadata: { chat_id: chatId },
      });

      return jsonResponse(500, { success: false, error: 'Error al consultar la conversación' });
    }

    if (!conversacion) {
      return jsonResponse(404, {
        success: false,
        error: 'No existe una conversación para ese chat_id',
      });
    }

    return jsonResponse<ModoConversacionResponse>(200, {
      success: true,
      data: { modo: (conversacion.modo as 'bot' | 'humano') ?? 'bot' },
    });
  } catch (error) {
    await logSystemEvent({
      level: 'error',
      source: 'mensajes-external',
      event: 'CONVERSACION_MODO_ERROR',
      message: error instanceof Error ? error.message : 'Error interno del servidor',
      requestId,
    });

    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
