export type TipoClienteDescuento = 'SOCIO' | 'NO_SOCIO';

export interface Descuento {
    id_descuento: number;
    nombre: string;
    porcentaje: number;
    fecha_desde: string | null;
    fecha_hasta: string | null;
    // 0 = domingo ... 6 = sábado
    dias_semana: number[];
    hora_desde: string | null;
    hora_hasta: string | null;
    tipos_cliente: TipoClienteDescuento[];
    duraciones_minutos: number[];
    id_recurso: number | null;
    activo: boolean;
    created_at: string;
    updated_at: string;
}

export type DescuentoInput = Omit<
    Descuento,
    'id_descuento' | 'created_at' | 'updated_at'
>;

export type EstadoVoucherUso = 'usado' | 'cancelado_cliente' | 'anulado';

export interface VoucherUso {
    id_uso: number;
    id_voucher: number;
    id_reserva: number | null;
    fecha_reserva: string;
    mes: string;
    estado: EstadoVoucherUso;
    motivo: string | null;
    reprogramaciones: number;
    created_at: string;
}

export interface Voucher {
    id_voucher: number;
    id_cliente: number;
    codigo: string;
    cupo_mensual: number;
    vigente_hasta: string | null;
    activo: boolean;
    created_at: string;
    cliente?: {
        nombre: string;
        apellido: string;
        telefono: string | null;
        tipo_cliente?: TipoClienteDescuento | null;
    } | null;
    // Usos que consumen cupo en el mes calendario actual.
    usos_mes?: number;
}

export interface VoucherInput {
    id_cliente: number;
    cupo_mensual: number;
    vigente_hasta: string | null;
}
