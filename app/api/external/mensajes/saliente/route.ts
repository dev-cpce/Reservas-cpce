import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logSystemEvent } from '@/lib/logger';
import { validarApiKeyN8n } from '@/lib/auth/apiKeyN8n';
import {
  ApiResponse,
  MensajeSalienteRequest,
  MensajeSalienteResponse,
} from '@/types/api';

const TEXTO_MAX = 4096;

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
      event: status >= 500 ? 'MENSAJE_SALIENTE_ERROR' : 'MENSAJE_SALIENTE_RECHAZADO',
      message: error,
      requestId,
      metadata: { ...getMeta(), ...extra, http_status: status },
    });

    return jsonResponse(status, { success: false, error });
  };
}

// POST: registra lo que respondió el asistente (origen = bot) para una conversación
// ya existente. No crea conversaciones nuevas: deben originarse en /mensajes/entrante.
export async function POST(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'n8n', operacion: 'mensaje_saliente' };
  const fallar = crearFallo(requestId, () => meta);

  try {
    if (!validarApiKeyN8n(request)) {
      await logSystemEvent({
        level: 'warning',
        source: 'mensajes-external',
        event: 'MENSAJE_SALIENTE_UNAUTHORIZED',
        message: 'Intento de registrar mensaje saliente con API Key inválida',
        requestId,
      });

      return jsonResponse(401, { success: false, error: 'API Key no válida' });
    }

    let body: MensajeSalienteRequest;

    try {
      body = await request.json();
    } catch {
      return fallar(400, 'El body debe ser un objeto JSON');
    }

    const chatId = typeof body?.chat_id === 'string' ? body.chat_id.trim() : '';
    const texto = typeof body?.texto === 'string' ? body.texto.slice(0, TEXTO_MAX) : '';
    const waMessageId =
      typeof body?.wa_message_id === 'string' && body.wa_message_id.trim()
        ? body.wa_message_id.trim()
        : null;

    meta = { ...meta, chat_id: chatId, wa_message_id: waMessageId };

    if (!chatId) return fallar(400, 'El campo chat_id es requerido');
    if (!texto) return fallar(400, 'El campo texto es requerido');

    const supabase = getSupabaseClient();

    const { data: conversacion, error: errorConversacion } = await supabase
      .from('conversacion')
      .select('id')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (errorConversacion) {
      return fallar(500, 'Error al consultar la conversación', {
        detalle: errorConversacion.message,
      });
    }

    if (!conversacion) {
      return fallar(
        404,
        'No existe una conversación para ese chat_id. Debe registrarse primero un mensaje entrante.'
      );
    }

    // Idempotencia: si ya hay un mensaje con ese wa_message_id, no se duplica.
    if (waMessageId) {
      const { data: mensajeExistente, error: errorBuscarMensaje } = await supabase
        .from('mensaje')
        .select('id')
        .eq('wa_message_id', waMessageId)
        .maybeSingle();

      if (errorBuscarMensaje) {
        return fallar(500, 'Error al verificar duplicados', {
          detalle: errorBuscarMensaje.message,
        });
      }

      if (mensajeExistente) {
        return jsonResponse<MensajeSalienteResponse>(200, {
          success: true,
          data: { duplicado: true },
        });
      }
    }

    const ahora = new Date().toISOString();

    const { error: errorInsertarMensaje } = await supabase.from('mensaje').insert({
      id_conversacion: conversacion.id,
      wa_message_id: waMessageId,
      direccion: 'saliente',
      origen: 'bot',
      tipo_contenido: 'texto',
      texto,
      estado: 'enviado',
      created_at: ahora,
    });

    if (errorInsertarMensaje) {
      return fallar(500, 'Error al guardar el mensaje', {
        detalle: errorInsertarMensaje.message,
      });
    }

    const { error: errorActualizarConversacion } = await supabase
      .from('conversacion')
      .update({ ultimo_mensaje_at: ahora, updated_at: ahora })
      .eq('id', conversacion.id);

    if (errorActualizarConversacion) {
      return fallar(500, 'Error al actualizar la conversación', {
        detalle: errorActualizarConversacion.message,
      });
    }

    await logSystemEvent({
      level: 'info',
      source: 'mensajes-external',
      event: 'MENSAJE_SALIENTE_REGISTRADO',
      requestId,
      metadata: meta,
    });

    return jsonResponse<MensajeSalienteResponse>(200, {
      success: true,
      data: { duplicado: false },
    });
  } catch (error) {
    return fallar(500, error instanceof Error ? error.message : 'Error interno del servidor');
  }
}
