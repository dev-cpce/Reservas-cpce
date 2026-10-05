'use server';

import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

export async function obtenerPermisosRecursos() {
  const puedeCrear = await tienePermisoUsuario(
    'recursos.crear'
  );

  const puedeEditar = await tienePermisoUsuario(
    'recursos.editar'
  );

  const puedeEliminar = await tienePermisoUsuario(
    'recursos.eliminar'
  );

  return {
    puedeCrear,
    puedeEditar,
    puedeEliminar,
  };
}