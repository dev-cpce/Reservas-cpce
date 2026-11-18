'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';
import type { Permiso } from '@/lib/permisos';
import type { Descuento, DescuentoInput } from '@/types/promociones';

async function exigirPermiso(permiso: Permiso, mensaje: string) {
  if (!(await tienePermisoUsuario(permiso))) {
    throw new Error(mensaje);
  }
}

function validarDescuento(d: DescuentoInput) {
  if (!d.nombre.trim()) {
    throw new Error('El nombre es obligatorio.');
  }

  if (!(d.porcentaje > 0 && d.porcentaje <= 100)) {
    throw new Error('El porcentaje debe ser mayor a 0 y hasta 100.');
  }

  if (d.fecha_desde && d.fecha_hasta && d.fecha_desde > d.fecha_hasta) {
    throw new Error('La fecha desde no puede ser posterior a la fecha hasta.');
  }

  if (d.dias_semana.length === 0) {
    throw new Error('Seleccioná al menos un día de la semana.');
  }

  if (d.tipos_cliente.length === 0) {
    throw new Error('Seleccioná al menos un tipo de cliente.');
  }

  if (d.duraciones_minutos.length === 0) {
    throw new Error('Seleccioná al menos una duración.');
  }

  if (Boolean(d.hora_desde) !== Boolean(d.hora_hasta)) {
    throw new Error('Indicá hora desde y hora hasta, o dejá ambas vacías.');
  }

  if (d.hora_desde && d.hora_desde === d.hora_hasta) {
    throw new Error('La hora desde y la hora hasta no pueden ser iguales.');
  }
}

function normalizar(d: DescuentoInput): DescuentoInput {
  return {
    ...d,
    nombre: d.nombre.trim(),
    fecha_desde: d.fecha_desde || null,
    fecha_hasta: d.fecha_hasta || null,
    hora_desde: d.hora_desde || null,
    hora_hasta: d.hora_hasta || null,
    id_recurso: d.id_recurso || null,
  };
}

export async function obtenerPermisosDescuentos() {
  const [puedeVer, puedeCrear, puedeEditar] = await Promise.all([
    tienePermisoUsuario('descuentos.ver'),
    tienePermisoUsuario('descuentos.crear'),
    tienePermisoUsuario('descuentos.editar'),
  ]);

  return { puedeVer, puedeCrear, puedeEditar };
}

export async function obtenerDescuentos(): Promise<Descuento[]> {
  await exigirPermiso('descuentos.ver', 'No tenés permisos para ver los descuentos.');

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('descuento')
    .select('*')
    .order('activo', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('No se pudieron cargar los descuentos.');
  }

  return (data || []) as Descuento[];
}

export async function crearDescuento(input: DescuentoInput): Promise<Descuento> {
  await exigirPermiso('descuentos.crear', 'No tenés permisos para crear descuentos.');

  const datos = normalizar(input);
  validarDescuento(datos);

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('descuento')
    .insert(datos)
    .select('*')
    .single();

  if (error) {
    console.error('Error al crear descuento:', error);
    throw new Error('No se pudo crear el descuento.');
  }

  return data as Descuento;
}

export async function actualizarDescuento(
  id: number,
  input: DescuentoInput
): Promise<Descuento> {
  await exigirPermiso('descuentos.editar', 'No tenés permisos para editar descuentos.');

  const datos = normalizar(input);
  validarDescuento(datos);

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('descuento')
    .update(datos)
    .eq('id_descuento', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error al actualizar descuento:', error);
    throw new Error('No se pudo actualizar el descuento.');
  }

  return data as Descuento;
}

export async function cambiarEstadoDescuento(
  id: number,
  activo: boolean
): Promise<Descuento> {
  await exigirPermiso('descuentos.editar', 'No tenés permisos para editar descuentos.');

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('descuento')
    .update({ activo })
    .eq('id_descuento', id)
    .select('*')
    .single();

  if (error) {
    console.error('Error al cambiar estado del descuento:', error);
    throw new Error('No se pudo cambiar el estado del descuento.');
  }

  return data as Descuento;
}
