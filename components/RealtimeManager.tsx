'use client';

import { useReservasRealtime } from '@/lib/useReservasRealtime';
import { useClientesRealtime } from '@/lib/useClientesRealtime';
export function RealtimeManager() {
  useReservasRealtime();
  useClientesRealtime();
  return null;
}
