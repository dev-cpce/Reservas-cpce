'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { RecursoBloqueo } from '@/types';

/**
 * Obtiene todos los bloqueos de recursos
 */
export async function obtenerBloqueos() {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso_bloqueo')
    .select('*')
    .order('fecha', { ascending: false });

  if (error) {
    throw new Error('No se pudieron cargar los bloqueos');
  }

  return data || [];
}

/**
 * Obtiene un bloqueo por su ID
 */
export async function obtenerBloqueoPorId(id: number) {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso_bloqueo')
    .select('*')
    .eq('id_bloqueo', id)
    .single();

  if (error) {
    throw new Error('No se pudo encontrar el bloqueo');
  }

  return data;
}

/**
 * Crea un nuevo bloqueo
 */
export async function crearBloqueo(bloqueo: Omit<RecursoBloqueo, 'id_bloqueo' | 'created_at'>) {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso_bloqueo')
    .insert([bloqueo])
    .select();

  if (error) {
    throw new Error('No se pudo crear el bloqueo');
  }

  return data?.[0];
}

/**
 * Actualiza un bloqueo existente
 */
export async function actualizarBloqueo(id: number, bloqueo: Partial<Omit<RecursoBloqueo, 'id_bloqueo' | 'created_at'>>) {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('recurso_bloqueo')
    .update(bloqueo)
    .eq('id_bloqueo', id)
    .select();

  if (error) {
    throw new Error('No se pudo actualizar el bloqueo');
  }

  return data?.[0];
}

/**
 * Elimina un bloqueo por su ID
 */
export async function eliminarBloqueo(id: number) {
  const supabase = createServerComponentClient({ cookies });

  const { error } = await supabase
    .from('recurso_bloqueo')
    .delete()
    .eq('id_bloqueo', id);

  if (error) {
    throw new Error('No se pudo eliminar el bloqueo');
  }

  return true;
}

/**
 * Activa o desactiva un bloqueo
 */
export async function cambiarEstadoBloqueo(id: number, activo: boolean) {
  return actualizarBloqueo(id, { activo });
}
