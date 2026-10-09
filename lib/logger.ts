// lib/logger.ts
import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sanitizarMetadata, sanitizarTexto } from '@/lib/logSanitizer';

export type LogLevel = 'info' | 'warning' | 'error' | 'critical';

interface LogSystemEventParams {
  level?: LogLevel;
  source: string;
  event: string;
  message?: string;
  requestId?: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
}

let supabaseAdmin: SupabaseClient | null = null;

// Cliente creado al primer uso: si faltan variables de entorno, el fallo queda
// dentro del try de logSystemEvent y no rompe la importación de las rutas.
function obtenerClienteAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Faltan variables de entorno de Supabase para el logger');
    }

    supabaseAdmin = createClient(url, key);
  }

  return supabaseAdmin;
}

export async function logSystemEvent({
  level = 'info',
  source,
  event,
  message,
  requestId,
  userId = null,
  metadata = {},
}: LogSystemEventParams): Promise<boolean> {
  try {
    const { error } = await obtenerClienteAdmin()
      .from('system_logs')
      .insert({
        level,
        source,
        event,
        message: message ? sanitizarTexto(message) : null,
        request_id: requestId ? sanitizarTexto(requestId) : null,
        user_id: userId,
        metadata: sanitizarMetadata(metadata),
      });

    if (error) {
      console.error('[LOGGER] No se pudo guardar el log:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('[LOGGER] Error inesperado:', error);
    return false;
  }
}