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

// ===== Bandeja de mensajes de WhatsApp (conversacion / mensaje) =====

export type ModoConversacion = 'bot' | 'humano';
export type EstadoMensaje = 'enviado' | 'entregado' | 'leido' | 'fallido';

export interface MensajeEntranteRequest {
  chat_id: string;
  wa_message_id: string;
  texto: string;
  timestamp?: string | number;
}

export interface MensajeEntranteResponse {
  modo: ModoConversacion;
  duplicado: boolean;
}

export interface MensajeSalienteRequest {
  chat_id: string;
  texto: string;
  wa_message_id?: string;
}

export interface MensajeSalienteResponse {
  duplicado: boolean;
}

export interface HandoffConversacionRequest {
  chat_id: string;
  motivo?: string;
}

export interface HandoffConversacionResponse {
  modo: ModoConversacion;
}

export interface ModoConversacionResponse {
  modo: ModoConversacion;
}

export interface EnviarMensajeRequest {
  id_conversacion: number;
  texto: string;
}

export interface EnviarMensajeResponse {
  id_mensaje: number;
  estado: EstadoMensaje;
  wa_message_id?: string | null;
}

export interface ActualizarModoConversacionRequest {
  modo: ModoConversacion;
}

export interface ActualizarModoConversacionResponse {
  modo: ModoConversacion;
}

export interface LeerConversacionResponse {
  no_leidos: number;
}

export interface ClienteResumenConversacion {
  id_cliente: number;
  nombre: string;
  apellido: string;
  telefono?: string | null;
}

export interface UltimoMensajeResumen {
  texto: string;
  direccion: 'entrante' | 'saliente';
  origen: 'cliente' | 'bot' | 'empleado';
  created_at: string;
}

export interface ConversacionResumen {
  id: number;
  chat_id: string;
  modo: ModoConversacion;
  no_leidos: number;
  ultimo_mensaje_at: string | null;
  ultimo_mensaje_cliente_at: string | null;
  cliente: ClienteResumenConversacion | null;
  ultimo_mensaje: UltimoMensajeResumen | null;
}

export interface ListaConversacionesResponse {
  conversaciones: ConversacionResumen[];
}

export interface MensajeHistorial {
  id: number;
  direccion: 'entrante' | 'saliente';
  origen: 'cliente' | 'bot' | 'empleado';
  texto: string;
  estado: EstadoMensaje;
  error_detalle?: string | null;
  wa_message_id?: string | null;
  created_at: string;
}

export interface HistorialMensajesResponse {
  conversacion: {
    id: number;
    chat_id: string;
    modo: ModoConversacion;
    no_leidos: number;
    ultimo_mensaje_cliente_at: string | null;
    cliente: ClienteResumenConversacion | null;
  };
  mensajes: MensajeHistorial[];
}