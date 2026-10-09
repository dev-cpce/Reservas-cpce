import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

// Valida x-api-key contra N8N_API_KEY en tiempo constante. Rechaza si la variable
// de entorno no está definida o está vacía.
export function validarApiKeyN8n(request: NextRequest): boolean {
  const esperada = process.env.N8N_API_KEY;
  const recibida = request.headers.get('x-api-key');

  if (!esperada || !recibida) return false;

  const a = Buffer.from(esperada);
  const b = Buffer.from(recibida);

  return a.length === b.length && timingSafeEqual(a, b);
}
