export interface DashboardStats {
  reservasConfirmadas: number;
  reservasPendientes: number;
  totalRecursos: number;
  recursosDisponibles: number;
  ingresosDiarios: number;
  ingresosMensuales: number;
  totalReservasMensuales: number;
  clientesActivos: number;
}

export interface ReservaPorHorario {
  hora: string;
  cantidad: number;
}

export interface ReservaPorDia {
  dia: string;
  cantidad: number;
}

export interface CanchaMasReservada {
  nombre: string;
  cantidad: number;
}

export interface IngresoMensual {
  mes: string;
  ingresos: number;
}

// LEGACY (modelo cancha): se mantiene para no romper otros consumidores existentes.
export interface HorarioDisponible {
  id_cancha: number;
  nombre: string;
  tipo: string;
  tarifa_hora: number;
  disponibilidad_horaria: string;
  horariosOcupados: string[]; // Rangos completos como "22:00-23:00"
  horariosOcupadosIndividuales: string[]; // Horarios individuales como "22:00"
  horariosDisponibles: string[];
  horariosPasados: string[];
  canchaEnMantenimiento: boolean;
  estadoCancha: string;
  totalHorariosHoy: number;
}

// Nuevo (modelo recurso): usado por el Dashboard migrado. Slots de 30 min.
export interface RecursoHorarioDisponible {
  id_recurso: number;
  nombre: string;
  tipo_recurso: string;
  deporte: string | null;
  capacidad: number | null;
  estado: string;
  activo: boolean;
  horaApertura: string | null;
  horaCierre: string | null;
  horariosOcupados: string[]; // Rangos completos como "10:00-11:30"
  horariosDisponibles: string[]; // Slots de 30 min como "10:00"
  horariosPasados: string[];
  enMantenimiento: boolean;
  totalHorariosHoy: number;
}

// Disponibilidad de un recurso para un día puntual (usado en el modal de 7 días).
export interface DiaDisponibilidadRecurso {
  fecha: string;
  horaApertura: string | null;
  horaCierre: string | null;
  horariosDisponibles: string[];
  horariosOcupados: string[];
}

export interface ReservaReciente {
  id_reserva: number;
  cliente_nombre: string;
  cancha_nombre: string;
  fecha_reserva: string;
  hora_inicio: string;
  hora_fin: string;
  estado_reserva: string;
  costo_reserva: number;
}