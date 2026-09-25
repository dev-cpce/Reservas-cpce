// Tipos del módulo de Reportes (basado en recurso, reserva, cliente, pago, recurso_bloqueo).
// Diseñados para reutilizarse tal cual en una futura generación de PDF.

export interface FiltrosReporte {
  fechaDesde: string; // YYYY-MM-DD
  fechaHasta: string; // YYYY-MM-DD
  idRecurso: number | null; // null = todos los recursos
  tipoCliente: 'SOCIO' | 'NO_SOCIO' | null; // null = todos
  estadoReserva: string | null; // 'pendiente' | 'confirmada' | 'cancelada' | 'completada' | null = todos
}

export interface ResumenEjecutivoReporte {
  totalReservas: number;
  reservasConfirmadas: number;
  reservasPendientes: number;
  reservasCanceladas: number;
  ingresosTotales: number;
  clientesUnicos: number;
  recursosActivos: number;
  ticketPromedio: number;
}

export interface ReservaPorRecursoReporte {
  id_recurso: number;
  nombre: string;
  tipo_recurso: string;
  totalReservas: number;
  reservasConfirmadas: number;
  reservasCanceladas: number;
  ingresos: number;
}

export interface DemandaPorHorarioReporte {
  hora: string; // slot "HH:MM" (30 min)
  cantidad: number;
}

export interface DemandaPorDiaSemanaReporte {
  dia: string;
  cantidad: number;
}

export interface ClienteReporte {
  id_cliente: number;
  nombre: string;
  apellido: string;
  tipo_cliente: string;
  totalReservas: number;
  totalGastado: number;
}

export interface IngresoPorEstadoPagoReporte {
  estado_pago: string;
  cantidad: number;
  monto: number;
}

export interface IngresoPorRecursoReporte {
  id_recurso: number;
  nombre: string;
  ingresos: number;
}

export interface DetalleCancelacionReporte {
  id_reserva: number;
  fecha_reserva: string;
  motivo: string;
}

export interface CancelacionesReporte {
  totalCanceladas: number;
  totalPendientesVencidas: number;
  detalle: DetalleCancelacionReporte[];
}

export interface BloqueoReporte {
  id_bloqueo: number;
  id_recurso: number;
  nombre_recurso: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  motivo: string | null;
  activo: boolean;
}

export interface OcupacionRecursoReporte {
  id_recurso: number;
  nombre: string;
  minutosDisponibles: number;
  minutosReservados: number;
  porcentajeOcupacion: number;
}

export interface DetalleReservaReporte {
  id_reserva: number;
  fecha_reserva: string;
  hora_inicio: string;
  hora_fin: string;
  duracion_minutos: number | null;
  estado_reserva: string;
  costo_reserva: number;
  cliente_nombre: string;
  cliente_tipo: string;
  recurso_nombre: string;
}

export interface ReporteCompleto {
  filtros: FiltrosReporte;
  resumen: ResumenEjecutivoReporte;
  reservasPorRecurso: ReservaPorRecursoReporte[];
  demandaPorHorario: DemandaPorHorarioReporte[];
  demandaPorDiaSemana: DemandaPorDiaSemanaReporte[];
  clientes: ClienteReporte[];
  ingresosPorEstadoPago: IngresoPorEstadoPagoReporte[];
  ingresosPorRecurso: IngresoPorRecursoReporte[];
  cancelaciones: CancelacionesReporte;
  bloqueos: BloqueoReporte[];
  ocupacion: OcupacionRecursoReporte[];
  detalleReservas: DetalleReservaReporte[];
}

export interface RecursoFiltroOpcion {
  id_recurso: number;
  nombre: string;
}
