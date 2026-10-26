'use server';

import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

export async function obtenerPermisosMensajes() {
  const puedeVer = await tienePermisoUsuario('mensajes.ver');
  const puedeEnviar = await tienePermisoUsuario('mensajes.enviar');

  return {
    puedeVer,
    puedeEnviar,
  };
}
