'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Cliente } from '@/types';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

/**
 * Obtiene todos los clientes de la base de datos
 */
export async function obtenerClientes() {
  const permitido = await tienePermisoUsuario('clientes.ver');

  if (!permitido) {
    throw new Error('No tenés permisos para ver los clientes.');
  }

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('cliente')
    .select('*')
    .order('id_cliente', { ascending: true });

  if (error) {
    throw new Error('No se pudieron cargar los clientes');
  }

  return data || [];
}

/**
 * Obtiene un cliente por su ID
 */
export async function obtenerClientePorId(id: number) {
  const permitido = await tienePermisoUsuario('clientes.ver');

  if (!permitido) {
    throw new Error('No tenés permisos para ver los clientes.');
  }

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('cliente')
    .select('*')
    .eq('id_cliente', id)
    .single();

  if (error) {
    throw new Error('No se pudo encontrar el cliente');
  }

  return data;
}

/**
 * Crea un nuevo cliente
 */
export async function crearCliente(
  cliente: Omit<Cliente, 'id_cliente' | 'fecha_registro'>
) {
  const permitido = await tienePermisoUsuario('clientes.crear');

  if (!permitido) {
    throw new Error('No tenés permisos para crear clientes.');
  }

  const supabase = createServerComponentClient({ cookies });

  const clienteConFecha = {
    ...cliente,
    fecha_registro: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('cliente')
    .insert([clienteConFecha])
    .select();

  if (error) {
    throw new Error('No se pudo crear el cliente');
  }

  return data?.[0];
}

/**
 * Actualiza un cliente existente
 */
export async function actualizarCliente(
  id: number,
  cliente: Partial<Omit<Cliente, 'id_cliente' | 'fecha_registro'>>
) {
  const permitido = await tienePermisoUsuario('clientes.editar');

  if (!permitido) {
    throw new Error('No tenés permisos para editar clientes.');
  }

  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('cliente')
    .update(cliente)
    .eq('id_cliente', id)
    .select();

  if (error) {
    throw new Error('No se pudo actualizar el cliente');
  }

  return data?.[0];
}

/**
 * Elimina un cliente por su ID
 */
export async function eliminarCliente(id: number) {
  const permitido = await tienePermisoUsuario('clientes.eliminar');

  if (!permitido) {
    throw new Error('No tenés permisos para eliminar clientes.');
  }

  const supabase = createServerComponentClient({ cookies });

  const { error } = await supabase
    .from('cliente')
    .delete()
    .eq('id_cliente', id);

  if (error) {
    throw new Error('No se pudo eliminar el cliente');
  }

  return true;
}

/**
 * Busca clientes por nombre, apellido o teléfono.
 *
 * La búsqueda se realiza mediante una función PostgreSQL
 * que utiliza unaccent para ignorar diferencias de tildes.
 */
export async function buscarClientes(query: string) {
  const permitido = await tienePermisoUsuario('clientes.ver');

  if (!permitido) {
    throw new Error('No tenés permisos para ver los clientes.');
  }

  const supabase = createServerComponentClient({ cookies });

  const termino = query.trim();

  if (!termino) {
    return obtenerClientes();
  }

  const { data, error } = await supabase.rpc(
    'buscar_clientes',
    {
      p_query: termino
    }
  );

  if (error) {
    console.error('Error al buscar clientes:', error);

    throw new Error(
      error.message || 'No se pudieron buscar los clientes'
    );
  }

  return data || [];
}

/**
 * Obtiene los permisos de clientes del usuario actual
 */
export async function obtenerPermisosClientes() {
  const puedeCrear = await tienePermisoUsuario('clientes.crear');
  const puedeEditar = await tienePermisoUsuario('clientes.editar');
  const puedeEliminar = await tienePermisoUsuario('clientes.eliminar');

  return {
    puedeCrear,
    puedeEditar,
    puedeEliminar,
  };
}