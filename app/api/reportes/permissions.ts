'use server';

import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

export async function obtenerPermisosReportes() {
  const puedeVer = await tienePermisoUsuario('reportes.ver');
  const puedeExportar = await tienePermisoUsuario('reportes.exportar');

  return {
    puedeVer,
    puedeExportar,
  };
}