// Utilidades puras (sin 'use server') para el nuevo modelo reserva -> recurso.
// Se usan tanto desde server actions (app/api/reservas/actions.ts) como desde
// componentes cliente (ReservaForm.tsx) para no duplicar las reglas de negocio.

export const DURACIONES_VALIDAS_MINUTOS = [90, 120] as const;
export type DuracionReservaMinutos = typeof DURACIONES_VALIDAS_MINUTOS[number];

export function esDuracionValida(duracionMinutos: number): duracionMinutos is DuracionReservaMinutos {
  return (DURACIONES_VALIDAS_MINUTOS as readonly number[]).includes(duracionMinutos);
}

// Minutos desde las 00:00 (0 a 1439), sin interpretación especial de "00:00".
export function horaAMinutos(hora: string): number {
  const [hh, mm] = hora.split(':').map(Number);
  return hh * 60 + mm;
}

// Minutos de `hora` interpretados como posteriores a `horaReferencia`. Si `hora` es
// estrictamente menor que la referencia se asume que corresponde al día siguiente
// (p. ej. un cierre "00:00"/"01:00" tras una apertura a las 08:00, o el fin de una
// reserva/bloqueo nocturno que cruza la medianoche). Centraliza la regla de cruce de
// medianoche para que horarios, solapamientos y reportes no la reimplementen cada uno.
export function puntoRelativoA(horaReferencia: string, hora: string): number {
  const referenciaMin = horaAMinutos(horaReferencia);
  const horaMin = horaAMinutos(hora);
  return horaMin < referenciaMin ? horaMin + 24 * 60 : horaMin;
}

// Duración en minutos entre `horaInicio` y `horaFin`, soportando el cruce de medianoche
// (si `horaFin` es menor que `horaInicio` se asume que es al día siguiente).
export function calcularDuracionEnMinutos(horaInicio: string, horaFin: string): number {
  return puntoRelativoA(horaInicio, horaFin) - horaAMinutos(horaInicio);
}

// El mod final evita que una reserva que cruza la medianoche devuelva una hora
// inválida como "24:30"; "00:30"/"01:00" ya representan el día siguiente.
export function calcularHoraFinPorDuracion(horaInicio: string, duracionMinutos: number): string {
  const [hh, mm] = horaInicio.split(':').map(Number);
  const finTotalMin = (hh * 60 + mm + duracionMinutos) % (24 * 60);
  const horaFinHH = Math.floor(finTotalMin / 60).toString().padStart(2, '0');
  const horaFinMM = (finTotalMin % 60).toString().padStart(2, '0');
  return `${horaFinHH}:${horaFinMM}`;
}

// Dos intervalos solapan si A.inicio < B.fin y A.fin > B.inicio (no alcanza con comparar
// hora_inicio). `horaReferencia` ancla los 4 puntos a un mismo día operativo (por defecto,
// el propio inicio de A) para poder comparar rangos nocturnos de forma consistente; pasá
// explícitamente la hora de apertura del recurso cuando compares contra horarios generados
// en grilla (que pueden mostrar valores ya envueltos como "00:30").
export function haySolapamientoDeHorarios(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string,
  horaReferencia: string = inicioA
): boolean {
  const inicioAMin = puntoRelativoA(horaReferencia, inicioA);
  const finAMin = puntoRelativoA(horaReferencia, finA);
  const inicioBMin = puntoRelativoA(horaReferencia, inicioB);
  const finBMin = puntoRelativoA(horaReferencia, finB);
  return inicioAMin < finBMin && finAMin > inicioBMin;
}

export interface IntervaloFechado {
  fecha: string; // YYYY-MM-DD
  hora_inicio: string;
  hora_fin: string;
}

function diasDesdeEpoch(fecha: string): number {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return Date.UTC(anio, mes - 1, dia) / (24 * 60 * 60 * 1000);
}

// Intervalo absoluto (en minutos desde una época arbitraria) de una reserva/bloqueo.
// A diferencia de `haySolapamientoDeHorarios`, usa la fecha real de cada fila, por lo
// que permite comparar correctamente filas de fechas consecutivas (p. ej. un bloqueo
// administrativo fechado al día siguiente de una reserva nocturna que termina a las
// 00:30/01:00, que de otro modo nunca se detectaría como conflicto).
function calcularIntervaloAbsoluto(intervalo: IntervaloFechado): { inicio: number; fin: number } {
  const diaBase = diasDesdeEpoch(intervalo.fecha) * 24 * 60;
  const inicio = diaBase + horaAMinutos(intervalo.hora_inicio);
  const finMismaFecha = diaBase + horaAMinutos(intervalo.hora_fin);
  const fin = finMismaFecha <= inicio ? finMismaFecha + 24 * 60 : finMismaFecha;
  return { inicio, fin };
}

// Igual que `haySolapamientoDeHorarios` pero soporta intervalos fechados en días
// consecutivos (fecha-1, fecha o fecha+1).
export function haySolapamientoEntreFechas(a: IntervaloFechado, b: IntervaloFechado): boolean {
  const intervaloA = calcularIntervaloAbsoluto(a);
  const intervaloB = calcularIntervaloAbsoluto(b);
  return intervaloA.inicio < intervaloB.fin && intervaloA.fin > intervaloB.inicio;
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
