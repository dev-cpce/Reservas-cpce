'use server';

import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';

import { sanitizarMetadata, sanitizarTexto } from '@/lib/logSanitizer';
import { esAdmin, requerirAdmin } from '@/lib/auth/requerirAdmin';
import {
  NIVELES_LOG,
  PERIODOS_LOG,
  type FiltrosLogs,
  type ResumenMonitoreo,
  type SystemLog,
} from '@/types/monitoreo';

const LIMITE_LOGS = 100;
const DURACION_PERIODO_MS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
} as const;

// Se usa el cliente con la sesión del usuario: además del chequeo explícito de
// ADMIN, la política RLS de system_logs actúa como segunda barrera.
function crearClienteSesion() {
  const cookieStore = cookies();
  return createServerComponentClient({ cookies: () => cookieStore });
}

export async function obtenerEsAdminMonitoreo(): Promise<boolean> {
  return esAdmin();
}

export async function obtenerResumenMonitoreo(): Promise<ResumenMonitoreo> {
  await requerirAdmin();
  const supabase = crearClienteSesion();

  const desde = new Date(Date.now() - DURACION_PERIODO_MS['24h']).toISOString();
  const inicio = Date.now();

  const contar = (level: string) =>
    supabase
      .from('system_logs')
      .select('id', { count: 'exact', head: true })
      .eq('level', level)
      .gte('created_at', desde);

  const [critical, error, warning, ultimo, origenes] = await Promise.all([
    contar('critical'),
    contar('error'),
    contar('warning'),
    supabase
      .from('system_logs')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('system_logs')
      .select('source')
      .gte('created_at', new Date(Date.now() - DURACION_PERIODO_MS['30d']).toISOString())
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const latenciaMs = Date.now() - inicio;
  const fallo = [critical, error, warning, ultimo, origenes].find((r) => r.error);

  if (fallo?.error) {
    console.error('[MONITOREO] Error consultando system_logs:', fallo.error.message);
    throw new Error('No se pudo consultar system_logs');
  }

  return {
    supabase: {
      conectado: true,
      latenciaMs,
      comprobadoEn: new Date().toISOString(),
    },
    ultimas24h: {
      critical: critical.count ?? 0,
      error: error.count ?? 0,
      warning: warning.count ?? 0,
    },
    ultimoEvento: ultimo.data?.[0]?.created_at ?? null,
    origenes: Array.from(
      new Set((origenes.data ?? []).map((r) => String(r.source)))
    ).sort(),
  };
}

export async function obtenerLogsMonitoreo(
  filtros: FiltrosLogs
): Promise<SystemLog[]> {
  await requerirAdmin();

  const nivel = NIVELES_LOG.find((n) => n === filtros?.nivel) ?? null;
  const periodo = PERIODOS_LOG.find((p) => p === filtros?.periodo) ?? '24h';
  const origen =
    typeof filtros?.origen === 'string' && filtros.origen.length <= 100
      ? filtros.origen
      : null;

  const supabase = crearClienteSesion();

  let query = supabase
    .from('system_logs')
    .select('id, created_at, level, source, event, message, request_id, user_id, metadata')
    .gte('created_at', new Date(Date.now() - DURACION_PERIODO_MS[periodo]).toISOString())
    .order('created_at', { ascending: false })
    .limit(LIMITE_LOGS);

  if (nivel) query = query.eq('level', nivel);
  if (origen) query = query.eq('source', origen);

  const { data, error } = await query;

  if (error) {
    console.error('[MONITOREO] Error consultando logs:', error.message);
    throw new Error('No se pudieron consultar los logs');
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    created_at: row.created_at,
    level: row.level,
    source: row.source,
    event: row.event,
    message: row.message ? sanitizarTexto(row.message) : row.message,
    request_id: row.request_id,
    user_id: row.user_id,
    metadata: sanitizarMetadata(row.metadata) as Record<string, unknown> | null,
  }));
}
