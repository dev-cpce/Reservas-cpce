import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logSystemEvent } from '@/lib/logger';
import { validarApiKeyN8n } from '@/lib/auth/apiKeyN8n';
import {
  ApiResponse,
  MensajeEntranteRequest,
  MensajeEntranteResponse,
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

// Registra en system_logs y responde un rechazo (4xx -> warning) o un fallo (5xx -> error).
function crearFallo(requestId: string, getMeta: () => Record<string, unknown>) {
  return async (status: number, error: string, extra: Record<string, unknown> = {}) => {
    await logSystemEvent({
      level: status >= 500 ? 'error' : 'warning',
      source: 'mensajes-external',
      event: status >= 500 ? 'MENSAJE_ENTRANTE_ERROR' : 'MENSAJE_ENTRANTE_RECHAZADO',
      message: error,
      requestId,
      metadata: { ...getMeta(), ...extra, http_status: status },
    });

    return jsonResponse(status, { success: false, error });
  };
}

// Meta envía el timestamp en segundos epoch (como string). Se tolera también
// milisegundos por si el nodo de n8n reenvía Date.now().
function parseTimestamp(valor: unknown): string | null {
  if (valor === undefined || valor === null || valor === '') return null;

  const numero = Number(valor);

  if (!Number.isFinite(numero) || numero <= 0) return null;

  const ms = numero > 1e12 ? numero : numero * 1000;
  const fecha = new Date(ms);

  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

// POST: registra un mensaje entrante del cliente, crea la conversación si falta
// y resuelve el cliente por chat_id (no crea clientes nuevos).
export async function POST(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  let meta: Record<string, unknown> = { origen: 'n8n', operacion: 'mensaje_entrante' };
  const fallar = crearFallo(requestId, () => meta);

  try {
    if (!validarApiKeyN8n(request)) {
      await logSystemEvent({
        level: 'warning',
        source: 'mensajes-external',
        event: 'MENSAJE_ENTRANTE_UNAUTHORIZED',
        message: 'Intento de registrar mensaje entrante con API Key inválida',
        requestId,
      });

      return jsonResponse(401, { success: false, error: 'API Key no válida' });
    }

    let body: MensajeEntranteRequest;

    try {
      body = await request.json();
    } catch {
      return fallar(400, 'El body debe ser un objeto JSON');
    }

    const chatId = typeof body?.chat_id === 'string' ? body.chat_id.trim() : '';
    const waMessageId =
      typeof body?.wa_message_id === 'string' ? body.wa_message_id.trim() : '';
    const texto = typeof body?.texto === 'string' ? body.texto.slice(0, TEXTO_MAX) : '';

    meta = { ...meta, chat_id: chatId, wa_message_id: waMessageId };

    if (!chatId) return fallar(400, 'El campo chat_id es requerido');
    if (!waMessageId) return fallar(400, 'El campo wa_message_id es requerido');
    if (!texto) return fallar(400, 'El campo texto es requerido');

    const createdAt = parseTimestamp(body?.timestamp) ?? new Date().toISOString();

    const supabase = getSupabaseClient();

    // Idempotencia: si ya existe un mensaje con ese wa_message_id, no se duplica
    // ni se vuelve a sumar no_leidos; se devuelve el modo actual tal cual está.
    const { data: mensajeExistente, error: errorBuscarMensaje } = await supabase
      .from('mensaje')
      .select('id, id_conversacion')
      .eq('wa_message_id', waMessageId)
      .maybeSingle();

    if (errorBuscarMensaje) {
      return fallar(500, 'Error al verificar duplicados', {
        detalle: errorBuscarMensaje.message,
      });
    }

    if (mensajeExistente) {
      const { data: conversacionExistente } = await supabase
        .from('conversacion')
        .select('modo')
        .eq('id', mensajeExistente.id_conversacion)
        .maybeSingle();

      return jsonResponse<MensajeEntranteResponse>(200, {
        success: true,
        data: {
          modo: (conversacionExistente?.modo as 'bot' | 'humano') ?? 'bot',
          duplicado: true,
        },
      });
    }

    // Buscar o crear la conversación. El cliente solo se resuelve por chat_id,
    // nunca se crea desde este endpoint (eso ya lo hace el nodo "GET CLIENTE" de n8n).
    const { data: conversacionActual, error: errorConversacion } = await supabase
      .from('conversacion')
      .select('id, modo, id_cliente, no_leidos')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (errorConversacion) {
      return fallar(500, 'Error al consultar la conversación', {
        detalle: errorConversacion.message,
      });
    }

    const { data: cliente } = await supabase
      .from('cliente')
      .select('id_cliente')
      .eq('chat_id', chatId)
      .maybeSingle();

    let conversacion = conversacionActual;

    if (!conversacion) {
      const { data: nuevaConversacion, error: errorCrear } = await supabase
        .from('conversacion')
        .insert({ chat_id: chatId, id_cliente: cliente?.id_cliente ?? null })
        .select('id, modo, id_cliente, no_leidos')
        .single();

      if (errorCrear || !nuevaConversacion) {
        return fallar(500, 'Error al crear la conversación', {
          detalle: errorCrear?.message,
        });
      }

      conversacion = nuevaConversacion;
    } else if (!conversacion.id_cliente && cliente?.id_cliente) {
      // El cliente puede haberse registrado después de iniciada la conversación.
      await supabase
        .from('conversacion')
        .update({ id_cliente: cliente.id_cliente })
        .eq('id', conversacion.id);
    }

    const { error: errorInsertarMensaje } = await supabase.from('mensaje').insert({
      id_conversacion: conversacion.id,
      wa_message_id: waMessageId,
      direccion: 'entrante',
      origen: 'cliente',
      tipo_contenido: 'texto',
      texto,
      estado: 'enviado',
      created_at: createdAt,
    });

    if (errorInsertarMensaje) {
      return fallar(500, 'Error al guardar el mensaje', {
        detalle: errorInsertarMensaje.message,
      });
    }

    const { error: errorActualizarConversacion } = await supabase
      .from('conversacion')
      .update({
        no_leidos: (conversacion.no_leidos ?? 0) + 1,
        ultimo_mensaje_at: createdAt,
        ultimo_mensaje_cliente_at: createdAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversacion.id);

    if (errorActualizarConversacion) {
      return fallar(500, 'Error al actualizar la conversación', {
        detalle: errorActualizarConversacion.message,
      });
    }

    await logSystemEvent({
      level: 'info',
      source: 'mensajes-external',
      event: 'MENSAJE_ENTRANTE_REGISTRADO',
      requestId,
      metadata: meta,
    });

    return jsonResponse<MensajeEntranteResponse>(200, {
      success: true,
      data: { modo: (conversacion.modo as 'bot' | 'humano') ?? 'bot', duplicado: false },
    });
  } catch (error) {
    return fallar(500, error instanceof Error ? error.message : 'Error interno del servidor');
  }
}
