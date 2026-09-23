'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Recurso } from '@/types';

/**
 * Obtiene todos los recursos de la base de datos (incluye inactivos y en mantenimiento)
 */
export async function obtenerRecursos() {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso')
    .select('*')
    .order('id_recurso', { ascending: true });

  if (error) {
    throw new Error('No se pudieron cargar los recursos');
  }

  return data || [];
}

/**
 * Obtiene un recurso por su ID
 */
export async function obtenerRecursoPorId(id: number) {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso')
    .select('*')
    .eq('id_recurso', id)
    .single();

  if (error) {
    throw new Error('No se pudo encontrar el recurso');
  }

  return data;
}

/**
 * Crea un nuevo recurso
 */
export async function crearRecurso(recurso: Omit<Recurso, 'id_recurso' | 'created_at' | 'updated_at'>) {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso')
    .insert([recurso])
    .select();

  if (error) {
    throw new Error('No se pudo crear el recurso');
  }

  return data?.[0];
}

/**
 * Actualiza un recurso existente
 */
export async function actualizarRecurso(id: number, recurso: Partial<Omit<Recurso, 'id_recurso' | 'created_at' | 'updated_at'>>) {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso')
    .update(recurso)
    .eq('id_recurso', id)
    .select();

  if (error) {
    throw new Error('No se pudo actualizar el recurso');
  }

  return data?.[0];
}

/**
 * Elimina un recurso por su ID
 */
export async function eliminarRecurso(id: number) {
  const supabase = createServerComponentClient({ cookies });

  const { error } = await supabase
    .from('recurso')
    .delete()
    .eq('id_recurso', id);

  if (error) {
    throw new Error('No se pudo eliminar el recurso');
  }

  return true;
}

/**
 * Activa o desactiva un recurso
 */
export async function cambiarEstadoRecurso(id: number, activo: boolean) {
  return actualizarRecurso(id, { activo });
}
