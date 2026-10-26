import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { logSystemEvent } from '@/lib/logger';
import { enviarTextoWhatsApp } from '@/lib/whatsappCloudApi';
import { ApiResponse, EnviarMensajeRequest, EnviarMensajeResponse } from '@/types/api';

const TEXTO_MAX = 4096;
const VENTANA_24H_MS = 24 * 60 * 60 * 1000;

// Se usa el cliente admin para leer/escribir conversacion y mensaje: la autorización
// real pasa por obtenerPerfil()/tienePermisoUsuario(), no por RLS de estas tablas.
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

// POST: un empleado responde manualmente por WhatsApp. Valida la ventana de 24 h,
// envía por la Graph API y registra el mensaje con el resultado real del envío.
export async function POST(request: NextRequest) {
  const requestId = `MSG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

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
        event: 'MENSAJE_ENVIAR_SIN_PERMISO',
        requestId,
        userId: perfil.id,
      });

      return jsonResponse(403, {
        success: false,
        error: 'No tenés permisos para enviar mensajes.',
      });
    }

    let body: EnviarMensajeRequest;

    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { success: false, error: 'El body debe ser un objeto JSON' });
    }

    const idConversacion = Number(body?.id_conversacion);
    const texto = typeof body?.texto === 'string' ? body.texto.trim() : '';

    if (!Number.isInteger(idConversacion) || idConversacion <= 0) {
      return jsonResponse(400, {
        success: false,
        error: 'id_conversacion debe ser un número entero positivo',
      });
    }

    if (!texto) {
      return jsonResponse(400, { success: false, error: 'El campo texto es requerido' });
    }

    if (texto.length > TEXTO_MAX) {
      return jsonResponse(400, {
        success: false,
        error: `El texto no puede superar ${TEXTO_MAX} caracteres`,
      });
    }

    const supabase = getSupabaseClient();

    const { data: conversacion, error: errorConversacion } = await supabase
      .from('conversacion')
      .select('id, chat_id, ultimo_mensaje_cliente_at')
      .eq('id', idConversacion)
      .maybeSingle();

    if (errorConversacion) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'MENSAJE_ENVIAR_ERROR',
        message: errorConversacion.message,
        requestId,
        userId: perfil.id,
      });

      return jsonResponse(500, { success: false, error: 'Error al consultar la conversación' });
    }

    if (!conversacion) {
      return jsonResponse(404, { success: false, error: 'La conversación no existe' });
    }

    const ultimoMensajeCliente = conversacion.ultimo_mensaje_cliente_at
      ? new Date(conversacion.ultimo_mensaje_cliente_at).getTime()
      : null;
    const ventanaVencida =
      !ultimoMensajeCliente || Date.now() - ultimoMensajeCliente > VENTANA_24H_MS;

    if (ventanaVencida) {
      await logSystemEvent({
        level: 'warning',
        source: 'mensajes-internal',
        event: 'MENSAJE_ENVIAR_VENTANA_VENCIDA',
        requestId,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion },
      });

      return jsonResponse(409, {
        success: false,
        error:
          'Pasaron más de 24 horas desde el último mensaje del cliente. No se puede enviar por WhatsApp hasta que el cliente vuelva a escribir.',
      });
    }

    
    // const destinatarioPrueba = '543834966666';
    // const resultadoEnvio = await enviarTextoWhatsApp(destinatarioPrueba, texto);
    const resultadoEnvio = await enviarTextoWhatsApp(conversacion.chat_id, texto);
    const ahora = new Date().toISOString();

    const { data: mensajeGuardado, error: errorInsertarMensaje } = await supabase
      .from('mensaje')
      .insert({
        id_conversacion: conversacion.id,
        wa_message_id: resultadoEnvio.ok ? resultadoEnvio.waMessageId ?? null : null,
        direccion: 'saliente',
        origen: 'empleado',
        tipo_contenido: 'texto',
        texto,
        estado: resultadoEnvio.ok ? 'enviado' : 'fallido',
        error_detalle: resultadoEnvio.ok ? null : resultadoEnvio.error,
        payload: {
          id_empleado: perfil.id,
          nombre_empleado: `${perfil.nombre ?? ''} ${perfil.apellido ?? ''}`.trim() || null,
        },
        created_at: ahora,
      })
      .select('id, wa_message_id, estado, error_detalle')
      .single();

    if (errorInsertarMensaje || !mensajeGuardado) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'MENSAJE_ENVIAR_DB_ERROR',
        message: errorInsertarMensaje?.message,
        requestId,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion, envio_ok: resultadoEnvio.ok },
      });

      return jsonResponse(500, {
        success: false,
        error:
          'El mensaje no pudo guardarse en la bandeja (aunque haya sido enviado a WhatsApp). Contactá a soporte.',
      });
    }

    // Una respuesta manual del empleado siempre pasa la conversación a modo humano,
    // haya fallado o no el envío (refleja la intención real del empleado de intervenir).
    const { error: errorActualizarConversacion } = await supabase
      .from('conversacion')
      .update({
        modo: 'humano',
        ...(resultadoEnvio.ok ? { ultimo_mensaje_at: ahora } : {}),
        updated_at: ahora,
      })
      .eq('id', conversacion.id);

    if (errorActualizarConversacion) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'MENSAJE_ENVIAR_CONV_UPDATE_ERROR',
        message: errorActualizarConversacion.message,
        requestId,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion },
      });
    }

    await logSystemEvent({
      level: resultadoEnvio.ok ? 'info' : 'error',
      source: 'mensajes-internal',
      event: resultadoEnvio.ok ? 'MENSAJE_ENVIAR_OK' : 'MENSAJE_ENVIAR_FALLO_GRAPH',
      message: resultadoEnvio.ok ? undefined : resultadoEnvio.error,
      requestId,
      userId: perfil.id,
      metadata: { id_conversacion: conversacion.id },
    });

    if (!resultadoEnvio.ok) {
      return jsonResponse<EnviarMensajeResponse>(502, {
        success: false,
        error: `No se pudo enviar el mensaje por WhatsApp: ${resultadoEnvio.error}`,
        data: {
          id_mensaje: mensajeGuardado.id,
          estado: mensajeGuardado.estado,
          wa_message_id: mensajeGuardado.wa_message_id,
        },
      });
    }

    return jsonResponse<EnviarMensajeResponse>(200, {
      success: true,
      data: {
        id_mensaje: mensajeGuardado.id,
        estado: mensajeGuardado.estado,
        wa_message_id: mensajeGuardado.wa_message_id,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
