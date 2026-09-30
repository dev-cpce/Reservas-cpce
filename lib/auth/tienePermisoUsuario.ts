import { obtenerPerfil } from '@/lib/auth/obtenerPerfil';
import {
  tienePermiso,
  type Permiso,
} from '@/lib/permisos';

export async function tienePermisoUsuario(
  permiso: Permiso
): Promise<boolean> {
  const perfil = await obtenerPerfil();

  if (!perfil) {
    return false;
  }

  return tienePermiso(perfil.rol, permiso);
}