import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { logSystemEvent } from '@/lib/logger';
import { validarApiKeyN8n } from '@/lib/auth/apiKeyN8n';
import {
  ApiResponse,
  RecordatorioDisponibilidad,
  RecordatoriosDisponibilidadResponse,
} from '@/types/api';

const MINUTOS_DEFAULT = 10;
const MINUTOS_MAX = 24 * 60;

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

// GET: devuelve las conversaciones a las que hay que recordarles la consulta de
// disponibilidad (bot respondió horarios, pasaron >= p_minutos sin respuesta del
// cliente y todavía no se les envió un recordatorio). Lo invoca un Schedule
// Trigger de n8n cada 1 minuto.
export async function GET(request: NextRequest) {
  const requestId = `EXT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  try {
    if (!validarApiKeyN8n(request)) {
      await logSystemEvent({
        level: 'warning',
        source: 'recordatorios-external',
        event: 'RECORDATORIO_DISPONIBILIDAD_UNAUTHORIZED',
        message: 'Intento de consultar recordatorios con API Key inválida',
        requestId,
      });

      return jsonResponse(401, { success: false, error: 'API Key no válida' });
    }

    const { searchParams } = new URL(request.url);
    const minutosParam = searchParams.get('minutos');
    let minutos = MINUTOS_DEFAULT;

    if (minutosParam !== null) {
      const parsed = Number(minutosParam);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MINUTOS_MAX) {
        return jsonResponse(400, {
          success: false,
          error: `El parámetro minutos debe ser un número entre 1 y ${MINUTOS_MAX}`,
        });
      }
      minutos = parsed;
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.rpc('obtener_recordatorios_disponibilidad', {
      p_minutos: minutos,
    });

    if (error) {
      await logSystemEvent({
        level: 'error',
        source: 'recordatorios-external',
        event: 'RECORDATORIO_DISPONIBILIDAD_ERROR',
        message: 'Error al obtener recordatorios de disponibilidad',
        requestId,
        metadata: { detalle: error.message },
      });

      return jsonResponse(500, { success: false, error: 'Error al obtener recordatorios' });
    }

    const filas = (data ?? []) as RecordatorioDisponibilidad[];
    const recordatorios: RecordatorioDisponibilidad[] = filas.map((fila) => ({
      id_conversacion: fila.id_conversacion,
      chat_id: fila.chat_id,
      fecha: fila.fecha,
      ultimo_mensaje_bot_at: fila.ultimo_mensaje_bot_at,
    }));

    return jsonResponse<RecordatoriosDisponibilidadResponse>(200, {
      success: true,
      data: { recordatorios },
    });
  } catch (error) {
    await logSystemEvent({
      level: 'error',
      source: 'recordatorios-external',
      event: 'RECORDATORIO_DISPONIBILIDAD_ERROR',
      message: error instanceof Error ? error.message : 'Error interno del servidor',
      requestId,
    });

    return jsonResponse(500, {
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
