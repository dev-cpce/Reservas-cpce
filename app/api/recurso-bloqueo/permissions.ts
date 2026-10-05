'use server';

import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

export async function obtenerPermisosBloqueos() {
  const puedeCrear = await tienePermisoUsuario(
    'bloqueos.crear'
  );

  const puedeEditar = await tienePermisoUsuario(
    'bloqueos.editar'
  );

  const puedeEliminar = await tienePermisoUsuario(
    'bloqueos.eliminar'
  );

  return {
    puedeCrear,
    puedeEditar,
    puedeEliminar,
  };
}