import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import { logSystemEvent } from '@/lib/logger';
import {
  ApiResponse,
  ClienteResumenConversacion,
  ConversacionResumen,
  ListaConversacionesResponse,
  UltimoMensajeResumen,
} from '@/types/api';

const LIMITE_CONVERSACIONES = 100;
const LIMITE_MENSAJES_PREVIEW = 400;

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

// GET: lista las conversaciones (más recientes primero) con el cliente asociado
// y una vista previa del último mensaje, para la bandeja de WhatsApp.
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

    const { data: conversaciones, error: errorConversaciones } = await supabase
      .from('conversacion')
      .select(
        'id, chat_id, id_cliente, modo, no_leidos, ultimo_mensaje_at, ultimo_mensaje_cliente_at'
      )
      .order('ultimo_mensaje_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(LIMITE_CONVERSACIONES);

    if (errorConversaciones) {
      await logSystemEvent({
        level: 'error',
        source: 'mensajes-internal',
        event: 'CONVERSACIONES_LISTAR_ERROR',
        message: errorConversaciones.message,
        userId: perfil.id,
      });

      return jsonResponse(500, {
        success: false,
        error: 'Error al obtener las conversaciones',
      });
    }

    const idsClientes = Array.from(
      new Set(
        (conversaciones ?? [])
          .map((c) => c.id_cliente)
          .filter((id): id is number => typeof id === 'number')
      )
    );
    const idsConversaciones = (conversaciones ?? []).map((c) => c.id);

    const clientesPorId = new Map<number, ClienteResumenConversacion>();

    if (idsClientes.length > 0) {
      const { data: clientes } = await supabase
        .from('cliente')
        .select('id_cliente, nombre, apellido, telefono')
        .in('id_cliente', idsClientes);

      for (const cliente of clientes ?? []) {
        clientesPorId.set(cliente.id_cliente, cliente);
      }
    }

    const ultimoMensajePorConversacion = new Map<number, UltimoMensajeResumen>();

    if (idsConversaciones.length > 0) {
      const { data: mensajesRecientes } = await supabase
        .from('mensaje')
        .select('id_conversacion, texto, direccion, origen, created_at')
        .in('id_conversacion', idsConversaciones)
        .order('created_at', { ascending: false })
        .limit(LIMITE_MENSAJES_PREVIEW);

      // Al venir ordenado descendente, la primera aparición de cada
      // id_conversacion es su mensaje más reciente.
      for (const mensaje of mensajesRecientes ?? []) {
        if (!ultimoMensajePorConversacion.has(mensaje.id_conversacion)) {
          ultimoMensajePorConversacion.set(mensaje.id_conversacion, {
            texto: mensaje.texto,
            direccion: mensaje.direccion,
            origen: mensaje.origen,
            created_at: mensaje.created_at,
          });
        }
      }
    }

    const resultado: ConversacionResumen[] = (conversaciones ?? []).map((c) => ({
      id: c.id,
      chat_id: c.chat_id,
      modo: c.modo,
      no_leidos: c.no_leidos ?? 0,
      ultimo_mensaje_at: c.ultimo_mensaje_at,
      ultimo_mensaje_cliente_at: c.ultimo_mensaje_cliente_at,
      cliente: c.id_cliente ? clientesPorId.get(c.id_cliente) ?? null : null,
      ultimo_mensaje: ultimoMensajePorConversacion.get(c.id) ?? null,
    }));

    return jsonResponse<ListaConversacionesResponse>(200, {
      success: true,
      data: { conversaciones: resultado },
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
