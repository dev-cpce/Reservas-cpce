'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import type { Permiso } from '@/lib/permisos';
import type { Voucher, VoucherInput, VoucherUso } from '@/types/promociones';

const COLUMNAS_VOUCHER =
  'id_voucher, id_cliente, codigo, cupo_mensual, vigente_hasta, activo, created_at, cliente:cliente(nombre, apellido, telefono, tipo_cliente)';

async function exigirPermiso(permiso: Permiso, mensaje: string) {
  if (!(await tienePermisoUsuario(permiso))) {
    throw new Error(mensaje);
  }
}

// Fecha de hoy en zona horaria de Argentina (mismo criterio que la base para el mes calendario).
function hoyArgentina(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
}

export async function obtenerPermisosVouchers() {
  const [puedeVer, puedeCrear, puedeEditar] = await Promise.all([
    tienePermisoUsuario('vouchers.ver'),
    tienePermisoUsuario('vouchers.crear'),
    tienePermisoUsuario('vouchers.editar'),
  ]);

  return { puedeVer, puedeCrear, puedeEditar };
}

export async function obtenerVouchers(): Promise<Voucher[]> {
  await exigirPermiso('vouchers.ver', 'No tenés permisos para ver los vouchers.');

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('voucher')
    .select(COLUMNAS_VOUCHER)
    .order('activo', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error al cargar vouchers:', error);
    throw new Error('No se pudieron cargar los vouchers.');
  }

  const vouchers = (data || []) as unknown as Voucher[];

  if (vouchers.length === 0) {
    return vouchers;
  }

  const mes = `${hoyArgentina().slice(0, 7)}-01`;

  const { data: usos, error: errorUsos } = await supabase
    .from('voucher_uso')
    .select('id_voucher')
    .eq('mes', mes)
    .in('estado', ['usado', 'cancelado_cliente'])
    .in(
      'id_voucher',
      vouchers.map((v) => v.id_voucher)
    );

  if (errorUsos) {
    console.error('Error al cargar usos del mes:', errorUsos);
  }

  const conteo = new Map<number, number>();

  for (const uso of usos || []) {
    conteo.set(uso.id_voucher, (conteo.get(uso.id_voucher) || 0) + 1);
  }

  return vouchers.map((v) => ({ ...v, usos_mes: conteo.get(v.id_voucher) || 0 }));
}

export async function obtenerUsosVoucher(idVoucher: number): Promise<VoucherUso[]> {
  await exigirPermiso('vouchers.ver', 'No tenés permisos para ver los vouchers.');

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('voucher_uso')
    .select(
      'id_uso, id_voucher, id_reserva, fecha_reserva, mes, estado, motivo, reprogramaciones, created_at'
    )
    .eq('id_voucher', idVoucher)
    .order('fecha_reserva', { ascending: false });

  if (error) {
    console.error('Error al cargar usos del voucher:', error);
    throw new Error('No se pudieron cargar los usos del voucher.');
  }

  return (data || []) as VoucherUso[];
}

export async function crearVoucher(input: VoucherInput): Promise<Voucher> {
  await exigirPermiso('vouchers.crear', 'No tenés permisos para crear vouchers.');

  if (!Number.isInteger(input.id_cliente) || input.id_cliente <= 0) {
    throw new Error('Seleccioná un cliente.');
  }

  if (!Number.isInteger(input.cupo_mensual) || input.cupo_mensual < 1) {
    throw new Error('El cupo mensual debe ser al menos 1.');
  }

  if (input.vigente_hasta && input.vigente_hasta < hoyArgentina()) {
    throw new Error('La fecha de vigencia no puede ser anterior a hoy.');
  }

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('voucher')
    .insert({
      id_cliente: input.id_cliente,
      cupo_mensual: input.cupo_mensual,
      vigente_hasta: input.vigente_hasta || null,
    })
    .select(COLUMNAS_VOUCHER)
    .single();

  if (error) {
    console.error('Error al crear voucher:', error);

    if (error.code === '23505') {
      throw new Error('El cliente ya tiene un voucher activo. Desactivalo antes de crear otro.');
    }

    throw new Error('No se pudo crear el voucher.');
  }

  return { ...(data as unknown as Voucher), usos_mes: 0 };
}

export async function cambiarEstadoVoucher(id: number, activo: boolean): Promise<void> {
  await exigirPermiso('vouchers.editar', 'No tenés permisos para editar vouchers.');

  const supabase = createServerComponentClient({ cookies });

  const { error } = await supabase
    .from('voucher')
    .update({ activo })
    .eq('id_voucher', id);

  if (error) {
    console.error('Error al cambiar estado del voucher:', error);

    if (error.code === '23505') {
      throw new Error('El cliente ya tiene otro voucher activo.');
    }

    throw new Error('No se pudo cambiar el estado del voucher.');
  }
}
