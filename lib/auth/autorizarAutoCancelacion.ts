import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

// Valida "Authorization: Bearer <CRON_SECRET>" en tiempo constante.
// Rechaza si CRON_SECRET no está definida o está vacía.
export function validarCronSecret(request: NextRequest): boolean {
  const esperada = process.env.CRON_SECRET;
  const header = request.headers.get('authorization');

  if (!esperada || !header || !header.startsWith('Bearer ')) return false;

  const a = Buffer.from(esperada);
  const b = Buffer.from(header.slice('Bearer '.length));

  return a.length === b.length && timingSafeEqual(a, b);
}

// Autoriza al planificador (CRON_SECRET) o a un usuario con sesión activa.
// Si se envía un Authorization header, se exige que sea válido (no se cae a la sesión).
export async function autorizarAutoCancelacion(request: NextRequest): Promise<boolean> {
  if (request.headers.get('authorization')) {
    return validarCronSecret(request);
  }

  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();
    return !!session;
  } catch {
    return false;
  }
}
