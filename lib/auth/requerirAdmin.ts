import { obtenerPerfil, type PerfilUsuario } from '@/lib/auth/obtenerPerfil';

export class AccesoDenegadoError extends Error {
  constructor() {
    super('Acceso denegado');
    this.name = 'AccesoDenegadoError';
  }
}

// Comprueba en servidor, contra perfiles.rol, que el usuario autenticado sea ADMIN.
export async function esAdmin(): Promise<boolean> {
  const perfil = await obtenerPerfil();
  return perfil?.rol === 'ADMIN';
}

export async function requerirAdmin(): Promise<PerfilUsuario> {
  const perfil = await obtenerPerfil();

  if (!perfil || perfil.rol !== 'ADMIN') {
    throw new AccesoDenegadoError();
  }

  return perfil;
}
