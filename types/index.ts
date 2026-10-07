
// ============================================================================
// MODELO NUEVO (Paso 2 de la migración cancha -> recurso).
// Refleja las tablas `recurso`, `tarifa`, `recurso_horario` y `recurso_bloqueo`
// que ya existen en Supabase.
// ============================================================================

export interface Recurso {
    id_recurso: number;
    nombre: string;
    tipo_recurso: 'CANCHA' | 'QUINCHO' | 'SALON' | 'PILETA' | 'OTRO';
    deporte: 'PADEL' | 'FUTBOL' | 'TENIS' | 'BASQUET' | 'OTRO' | null;
    capacidad: number | null;
    estado: 'DISPONIBLE' | 'MANTENIMIENTO' | 'FUERA_SERVICIO';
    descripcion: string | null;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export interface Tarifa {
    id_tarifa: number;
    id_recurso: number;
    tipo_cliente: 'SOCIO' | 'NO_SOCIO';
    duracion_minutos: number;
    precio: number;
    vigente_desde: string | null;
    vigente_hasta: string | null;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export interface RecursoHorario {
    id_horario: number;
    id_recurso: number;
    dia_semana: number;
    hora_apertura: string;
    hora_cierre: string;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export interface RecursoBloqueo {
    id_bloqueo: number;
    id_recurso: number;
    fecha: string;
    hora_inicio: string;
    hora_fin: string;
    motivo: string | null;
    activo: boolean;
    created_at: string;
}

export interface Cliente {
    id_cliente: number;
    nombre: string;
    apellido: string;
    telefono?: string;
    email?: string;
    fecha_registro?: string;
    created_at?: string;
    // Nuevo (Paso 2): distingue socio / no socio para el cálculo de tarifas.
    tipo_cliente?: 'SOCIO' | 'NO_SOCIO';
}

export interface Reserva {
    id_reserva: number;
    fecha_reserva: string;
    hora_inicio: string;
    hora_fin: string;
    estado_reserva: string;
    id_cliente: number;
    costo_reserva: number;
    created_at?: string;

    id_recurso?: number | null;
    recurso?: Recurso;
    duracion_minutos?: number | null;
    fecha_expiracion_pago?: string | null;

    costo_total?: number;
    observaciones?: string;
    cliente?: Cliente;
    fecha?: string;
    cliente_id?: number;
}

export interface Pago {
    id_pago: number;
    id_reserva: number;
    monto: number;
    estado_pago: 'aprobado' | 'pendiente' | 'cancelado' | 'desconocido';
    mp_id?: string | null;
    fecha_pago: string;
    reserva?: Reserva;
}

// Nuevo (Paso 3): payload para crear/actualizar una reserva ya migrada al modelo
// de recurso. No incluye hora_fin/costo_reserva porque se calculan en el servidor.
export interface NuevaReservaRecursoInput {
    id_cliente: number;
    id_recurso: number;
    fecha_reserva: string;
    hora_inicio: string;
    duracion_minutos: number;
}


export interface DashboardStats {
    totalReservations: number;
    activeReservations: number;
    totalIncome: number;
}