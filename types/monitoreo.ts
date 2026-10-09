export const NIVELES_LOG = ['info', 'warning', 'error', 'critical'] as const;
export type NivelLog = (typeof NIVELES_LOG)[number];

export const PERIODOS_LOG = ['1h', '24h', '7d', '30d'] as const;
export type PeriodoLog = (typeof PERIODOS_LOG)[number];

export interface SystemLog {
  id: string;
  created_at: string;
  level: NivelLog;
  source: string;
  event: string;
  message: string | null;
  request_id: string | null;
  user_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface FiltrosLogs {
  nivel: NivelLog | null;
  origen: string | null;
  periodo: PeriodoLog;
}

export interface ResumenMonitoreo {
  supabase: {
    conectado: boolean;
    latenciaMs: number;
    comprobadoEn: string;
  };
  ultimas24h: {
    critical: number;
    error: number;
    warning: number;
  };
  ultimoEvento: string | null;
  origenes: string[];
}
