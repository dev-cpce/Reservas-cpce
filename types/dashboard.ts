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
