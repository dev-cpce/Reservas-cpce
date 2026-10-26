import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logSystemEvent } from '@/lib/logger';
import { validarApiKeyN8n } from '@/lib/auth/apiKeyN8n';
import {
  ApiResponse,
  HandoffConversacionRequest,
  HandoffConversacionResponse,
} from '@/types/api';

const MOTIVO_MAX = 300;

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

function crearFallo(requestId: string, getMeta: () => Record<string, unknown>) {
  return async (status: number, error: string, extra: Record<string, unknown> = {}) => {
    await logSystemEvent({
      level: status >= 500 ? 'error' : 'warning',
      source: 'mensajes-external',
      event: status >= 500 ? 'CONVERSACION_HANDOFF_ERROR' : 'CONVERSACION_HANDOFF_RECHAZADO',
      message: error,
      requestId,
      metadata: { ...getMeta(), ...extra, http_status: status },
    });

    return jsonResponse(status, { success: false, error });
  };
}

// POST: el asistente deriva la conversación a un empleado (modo = humano) y deja
// de responder. No hay columna "motivo" en conversacion: se guarda solo en el log.
export async function POST(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'n8n', operacion: 'handoff' };
  const fallar = crearFallo(requestId, () => meta);

  try {
    if (!validarApiKeyN8n(request)) {
      await logSystemEvent({
        level: 'warning',
        source: 'mensajes-external',
        event: 'CONVERSACION_HANDOFF_UNAUTHORIZED',
        message: 'Intento de handoff con API Key inválida',
        requestId,
      });

      return jsonResponse(401, { success: false, error: 'API Key no válida' });
    }

    let body: HandoffConversacionRequest;

    try {
      body = await request.json();
    } catch {
      return fallar(400, 'El body debe ser un objeto JSON');
    }

    const chatId = typeof body?.chat_id === 'string' ? body.chat_id.trim() : '';
    const motivo =
      typeof body?.motivo === 'string' && body.motivo.trim()
        ? body.motivo.trim().slice(0, MOTIVO_MAX)
        : null;

    meta = { ...meta, chat_id: chatId, motivo };

    if (!chatId) return fallar(400, 'El campo chat_id es requerido');

    const supabase = getSupabaseClient();

    const { data: conversacion, error } = await supabase
      .from('conversacion')
      .update({ modo: 'humano', updated_at: new Date().toISOString() })
      .eq('chat_id', chatId)
      .select('id, modo')
      .maybeSingle();

    if (error) {
      return fallar(500, 'Error al actualizar la conversación', { detalle: error.message });
    }

    if (!conversacion) {
      return fallar(404, 'No existe una conversación para ese chat_id');
    }

    await logSystemEvent({
      level: 'info',
      source: 'mensajes-external',
      event: 'CONVERSACION_HANDOFF_OK',
      requestId,
      metadata: meta,
    });

    return jsonResponse<HandoffConversacionResponse>(200, {
      success: true,
      data: { modo: (conversacion.modo as 'bot' | 'humano') ?? 'humano' },
    });
  } catch (error) {
    return fallar(500, error instanceof Error ? error.message : 'Error interno del servidor');
  }
}
