const CLAVES_SENSIBLES =
  /pass|passwd|secret|token|authorization|api[-_]?key|apikey|credential|cookie|service[-_]?role|bearer|jwt|clave|contrase/i;
const CLAVES_PII_OCULTAS = /^(email|e-mail|correo|dni|cuit|cuil)$/i;
const CLAVES_PII_PARCIALES = /^(chat_id|chatid|telefono|teléfono|phone|celular)$/i;

const PATRONES_TEXTO: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [oculto]'],
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt oculto]'],
  [/\b(?:APP_USR|TEST)-[A-Za-z0-9-]{10,}/g, '[token oculto]'],
  [
    /\b(password|passwd|secret|token|api[-_]?key|authorization|access_token)(["']?\s*[=:]\s*["']?)[^\s"',;&]+/gi,
    '$1$2[oculto]',
  ],
];

function secretosDelEntorno(): string[] {
  return [
    process.env.N8N_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.WHATSAPP_VERIFY_TOKEN,
  ].filter((s): s is string => typeof s === 'string' && s.length >= 8);
}

// Oculta secretos conocidos y patrones típicos (Bearer, JWT, tokens de Mercado Pago, clave=valor).
export function sanitizarTexto(texto: string): string {
  let resultado = texto;

  for (const secreto of secretosDelEntorno()) {
    resultado = resultado.split(secreto).join('[oculto]');
  }

  for (const [patron, reemplazo] of PATRONES_TEXTO) {
    resultado = resultado.replace(patron, reemplazo);
  }

  return resultado;
}

function enmascarar(valor: unknown): unknown {
  if (valor === null || valor === undefined) return valor;
  const texto = String(valor);
  return texto.length > 4 ? `***${texto.slice(-4)}` : '[oculto]';
}

// Sanea metadata (anidada) antes de guardarla o mostrarla: oculta claves
// sensibles, enmascara identificadores personales y limpia los textos.
export function sanitizarMetadata(valor: unknown, profundidad = 0): unknown {
  if (profundidad > 6) return '[truncado]';
  if (typeof valor === 'string') return sanitizarTexto(valor);
  if (valor instanceof Date) return valor.toISOString();
  if (valor instanceof Error) return sanitizarTexto(valor.message);
  if (Array.isArray(valor)) {
    return valor.map((v) => sanitizarMetadata(v, profundidad + 1));
  }
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>).map(([k, v]) => {
        if (CLAVES_SENSIBLES.test(k) || CLAVES_PII_OCULTAS.test(k)) {
          return [k, '[oculto]'];
        }
        if (CLAVES_PII_PARCIALES.test(k) && typeof v !== 'object') {
          return [k, enmascarar(v)];
        }
        return [k, sanitizarMetadata(v, profundidad + 1)];
      })
    );
  }
  return valor;
}
