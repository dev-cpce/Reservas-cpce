// Utilidades puras (sin 'use server') para el nuevo modelo reserva -> recurso.
// Se usan tanto desde server actions (app/api/reservas/actions.ts) como desde
// componentes cliente (ReservaForm.tsx) para no duplicar las reglas de negocio.

export const DURACIONES_VALIDAS_MINUTOS = [90, 120] as const;
export type DuracionReservaMinutos = typeof DURACIONES_VALIDAS_MINUTOS[number];

export function esDuracionValida(duracionMinutos: number): duracionMinutos is DuracionReservaMinutos {
  return (DURACIONES_VALIDAS_MINUTOS as readonly number[]).includes(duracionMinutos);
}

// 00:00 se interpreta como fin del día (24:00) para poder comparar rangos que cruzan la medianoche.
export function horaAMinutos(hora: string): number {
  const [hh, mm] = hora.split(':').map(Number);
  if (hh === 0 && mm === 0) return 24 * 60;
  return hh * 60 + mm;
}

export function calcularHoraFinPorDuracion(horaInicio: string, duracionMinutos: number): string {
  const [hh, mm] = horaInicio.split(':').map(Number);
  const finTotalMin = (hh * 60 + mm + duracionMinutos) % (24 * 60);
  const horaFinHH = Math.floor(finTotalMin / 60).toString().padStart(2, '0');
  const horaFinMM = (finTotalMin % 60).toString().padStart(2, '0');
  return `${horaFinHH}:${horaFinMM}`;
}

// Dos intervalos solapan si A.inicio < B.fin y A.fin > B.inicio (no alcanza con comparar hora_inicio).
export function haySolapamientoDeHorarios(inicioA: string, finA: string, inicioB: string, finB: string): boolean {
  return horaAMinutos(inicioA) < horaAMinutos(finB) && horaAMinutos(finA) > horaAMinutos(inicioB);
}

export interface ReservaBloqueante {
  estado_reserva: string;
  fecha_expiracion_pago?: string | null;
}

// CONFIRMADA siempre bloquea. PENDIENTE solo bloquea mientras no venza fecha_expiracion_pago.
// Sin fecha_expiracion_pago (reservas legacy) se preserva el comportamiento anterior: bloquea.
export function reservaBloqueaRecurso(reserva: ReservaBloqueante, ahora: Date = new Date()): boolean {
  if (reserva.estado_reserva === 'confirmada') return true;
  if (reserva.estado_reserva === 'pendiente') {
    if (!reserva.fecha_expiracion_pago) return true;
    return new Date(reserva.fecha_expiracion_pago).getTime() > ahora.getTime();
  }
  return false;
}

export function calcularFechaExpiracionPago(minutos = 5): string {
  return new Date(Date.now() + minutos * 60 * 1000).toISOString();
}
