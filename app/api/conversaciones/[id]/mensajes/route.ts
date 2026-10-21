import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { logSystemEvent } from '@/lib/logger';
import { ApiResponse, HistorialMensajesResponse } from '@/types/api';

const LIMITE_MENSAJES = 300;

// Se usa el cliente admin para leer conversacion/mensaje/cliente: la autorización
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

// GET: historial de mensajes de una conversación (más recientes al final), para
// mostrar el chat completo en la bandeja de WhatsApp.
export async function GET(
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

    const { data: conversacion, error: errorConversacion } = await supabase
      .from('conversacion')
      .select('id, chat_id, modo, no_leidos, id_cliente, ultimo_mensaje_cliente_at')
      .eq('id', idConversacion)
      .maybeSingle();

    if (errorConversacion) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'CONVERSACION_HISTORIAL_ERROR',
        message: errorConversacion.message,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion },
      });

      return jsonResponse(500, { success: false, error: 'Error al consultar la conversación' });
    }

    if (!conversacion) {
      return jsonResponse(404, { success: false, error: 'La conversación no existe' });
    }

    let cliente = null;

    if (conversacion.id_cliente) {
      const { data: clienteData } = await supabase
        .from('cliente')
        .select('id_cliente, nombre, apellido, telefono')
        .eq('id_cliente', conversacion.id_cliente)
        .maybeSingle();

      cliente = clienteData ?? null;
    }

    const { data: mensajes, error: errorMensajes } = await supabase
      .from('mensaje')
      .select('id, direccion, origen, texto, estado, error_detalle, wa_message_id, created_at')
      .eq('id_conversacion', idConversacion)
      // Se ordena por id (orden real de inserción) y no por created_at: los
      // mensajes entrantes guardan el timestamp que informa WhatsApp y los
      // salientes la hora de inserción del bot/empleado, por lo que no son
      // comparables entre sí cuando hay latencia de procesamiento (el
      // cliente puede escribir de nuevo antes de que se registre la
      // respuesta anterior). El id coincide con el orden de llegada que ya
      // usa el agregado de Realtime, evitando que el historial se vea
      // distinto al recargar la página.
      .order('id', { ascending: false })
      .limit(LIMITE_MENSAJES);

    if (errorMensajes) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'CONVERSACION_HISTORIAL_MENSAJES_ERROR',
        message: errorMensajes.message,
        userId: perfil.id,
        metadata: { id_conversacion: idConversacion },
      });

      return jsonResponse(500, { success: false, error: 'Error al obtener los mensajes' });
    }

    // Se consultó descendente para aplicar el límite sobre los más recientes;
    // se devuelve en orden cronológico ascendente para pintar el chat.
    const mensajesOrdenados = (mensajes ?? []).slice().reverse();

    return jsonResponse<HistorialMensajesResponse>(200, {
      success: true,
      data: {
        conversacion: {
          id: conversacion.id,
          chat_id: conversacion.chat_id,
          modo: conversacion.modo,
          no_leidos: conversacion.no_leidos ?? 0,
          ultimo_mensaje_cliente_at: conversacion.ultimo_mensaje_cliente_at,
          cliente,
        },
        mensajes: mensajesOrdenados,
      },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
