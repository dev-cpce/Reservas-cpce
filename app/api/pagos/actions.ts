'use server';

import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

export async function obtenerPermisosPagos() {
  const puedeConfirmar = await tienePermisoUsuario('pagos.confirmar');
  const puedeEditar = await tienePermisoUsuario('pagos.editar');

  return {
    puedeConfirmar,
    puedeEditar,
  };
}