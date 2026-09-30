import { cookies } from 'next/headers';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Rol } from '@/lib/permisos';

export interface PerfilUsuario {
  id: string;
  nombre: string | null;
  apellido: string | null;
  rol: Rol;
}

export async function obtenerPerfil(): Promise<PerfilUsuario | null> {
  try {
    const cookieStore = cookies();

    const supabase = createServerComponentClient({
      cookies: () => cookieStore,
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return null;
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('perfiles')
      .select('id, nombre, apellido, rol')
      .eq('id', user.id)
      .single();

    if (perfilError || !perfil) {
      return null;
    }

    return {
      id: perfil.id,
      nombre: perfil.nombre,
      apellido: perfil.apellido,
      rol: perfil.rol as Rol,
    };
  } catch {
    return null;
  }
}