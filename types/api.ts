export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DisponibilidadRecursoResponse {
  id_recurso: number;
  nombre: string;
  tipo_recurso: string;
  deporte: string | null;
  capacidad: number | null;
  estado: string;
  disponible: boolean;
  horariosDisponibles: string[];
  horariosOcupados: {
    hora_inicio: string;
    hora_fin: string;
    tipo: 'reserva' | 'bloqueo';
    motivo?: string | null;
  }[];
}


export interface ReservaExternaRequest {
  cliente_nombre: string;
  cliente_telefono: string;
  cliente_email?: string;
  cancha_id: number;
  fecha_reserva: string; // YYYY-MM-DD
  hora_inicio: string;   // HH:MM
  hora_fin: string;      // HH:MM
}


export interface CrearReservaRequest {
  chat_id: string;
  id_cancha: number;
  fecha_reserva: string; // YYYY-MM-DD
  hora_inicio: string;   // HH:MM
  duracion_horas?: number; // por defecto 1 hora
  estado_reserva: 'pendiente' | 'confirmada' | 'cancelada';
  costo_reserva: number; // monto de la seña
}

export interface ActualizarReservaRequest {
  id_reserva: number;
  estado_reserva: 'pendiente' | 'confirmada' | 'cancelada';
}

export interface ReservaResponse {
  id_reserva: number;
  id_cliente: number;
  id_cancha: number;
  fecha_reserva: string;
  hora_inicio: string;
  hora_fin: string;
  estado_reserva: string;
  costo_reserva: number;
  created_at: string;
  cliente?: {
    nombre: string;
    apellido: string;
    telefono?: string;
    chat_id: string;
  };
  cancha?: {
    nombre: string;
    tipo: string;
    tarifa_hora: number;
  };
}

export interface ClienteExternoRequest {
  nombre: string;
  telefono: string;
  email?: string;
}

export interface ConsultaDisponibilidadRequest {
  fecha?: string; // YYYY-MM-DD
  id_recurso?: number;
  hora_inicio?: string; // HH:MM
  duracion_minutos?: 90 | 120;
}

export interface EstadisticasResponse {
  reservasHoy: number;
  reservasSemana: number;
  ingresosDia: number;
  ingresosSemana: number;
  canchasMasUsadas: {
    nombre: string;
    reservas: number;
  }[];
}


export interface VerificarClienteRequest {
  chat_id: string;
}

export interface VerificarClienteResponse {
  existe: boolean;
  cliente?: {
    id_cliente: number;
    nombre: string;
    apellido: string;
    telefono?: string;
    chat_id: string;
    tipo_cliente: 'SOCIO' | 'NO_SOCIO';
  };
}

export interface CrearClienteRequest {
  chat_id: string;
  nombre: string;
  apellido: string;
  telefono?: string;
}

export interface CrearClienteResponse {
  id_cliente: number;
  nombre: string;
  apellido: string;
  telefono?: string;
  chat_id: string;
  tipo_cliente: 'SOCIO' | 'NO_SOCIO';
}

// Interfaces para cliente_pendiente
export interface VerificarClientePendienteRequest {
  chat_id: string;
}

export interface VerificarClientePendienteResponse {
  existe: boolean;
  esperando?: string;
  cliente_pendiente?: {
    id_cliente_pendiente: number;
    chat_id: string;
    esperando: string;
    creado_en: string;
    actualizado_en: string;
  };
}

export interface CrearClientePendienteRequest {
  chat_id: string;
  esperando: string;
}

export interface CrearClientePendienteResponse {
  id_cliente_pendiente: number;
  chat_id: string;
  esperando: string;
  creado_en: string;
  actualizado_en: string;
}

export interface EliminarClientePendienteRequest {
  chat_id: string;
}


export interface ObtenerContextoUsuarioRequest {
  chat_id: string;
}

export interface ContextoUsuarioResponse {
  chat_id: string;
  fecha?: string | null;
  hora_inicio?: string | null;
  tipo_cancha?: string | null;
  cancha_nro?: number | null;
  accion_pendiente?: string | null;
  updated_at: string;
}

export interface UpsertContextoUsuarioRequest {
  chat_id: string;
  fecha?: string | null;
  hora_inicio?: string | null;
  tipo_cancha?: string | null;
  cancha_nro?: number | null;
  accion_pendiente?: string | null;
}


export interface PagoResponse {
  id_pago: number;
  id_reserva: number;
  monto: number;
  estado_pago: 'pendiente' | 'completado' | 'fallido';
  mp_id?: string | null;
  fecha_pago: string;
  reserva?: {
    id_reserva: number;
    fecha_reserva: string;
    hora_inicio: string;
    hora_fin: string;
    cliente?: {
      nombre: string;
      apellido: string;
      telefono?: string;
    };
    cancha?: {
      nombre: string;
      tipo: string;
    };
  };
}

export interface CrearPagoRequest {
  id_reserva: number;
  monto: number;
  estado_pago: 'aprobado' | 'pendiente' | 'cancelado' | 'desconocido';
  mp_id?: string;
}

export interface ActualizarPagoRequest {
  id_pago: number;
  estado_pago: 'aprobado' | 'pendiente' | 'cancelado' | 'desconocido';
  mp_id?: string;
}