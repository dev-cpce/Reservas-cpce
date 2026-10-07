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


export interface ActualizarReservaRequest {
  id_reserva: number;
  estado_reserva: 'pendiente' | 'confirmada' | 'cancelada';
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
  accion_pendiente?: string | null;
  updated_at: string;
}

export interface UpsertContextoUsuarioRequest {
  chat_id: string;
  fecha?: string | null;
  hora_inicio?: string | null;
  accion_pendiente?: string | null;
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