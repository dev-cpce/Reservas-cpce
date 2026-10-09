import { NextRequest, NextResponse } from 'next/server';

import { logSystemEvent } from '@/lib/logger';
import { validarApiKeyN8n } from '@/lib/auth/apiKeyN8n';
import { NIVELES_LOG } from '@/types/monitoreo';

// Endpoint para que n8n registre eventos propios (p. ej. webhook de Mercado Pago)
// en system_logs sin conocer la Service Role Key: solo usa N8N_API_KEY.

const MAX_METADATA_BYTES = 4096;
const EVENTO_VALIDO = /^[A-Z0-9_]{3,80}$/;
const WORKFLOW_VALIDO = /^[A-Za-z0-9 _.\-]{1,80}$/;

function texto(valor: unknown, max: number): string | undefined {
  return typeof valor === 'string' && valor.length > 0
    ? valor.slice(0, max)
    : undefined;
}

export async function POST(request: NextRequest) {
  if (!validarApiKeyN8n(request)) {
    return NextResponse.json(
      { success: false, error: 'API Key no válida' },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await request.json();

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Body inválido');
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: 'El body debe ser un objeto JSON' },
      { status: 400 }
    );
  }

  const nivel = NIVELES_LOG.find((n) => n === body.level) ?? 'info';
  const evento = typeof body.event === 'string' ? body.event.toUpperCase() : '';

  if (!EVENTO_VALIDO.test(evento)) {
    return NextResponse.json(
      {
        success: false,
        error: 'event es obligatorio y debe ser A-Z, 0-9 o _ (3 a 80 caracteres)',
      },
      { status: 400 }
    );
  }

  const metadataEntrada =
    body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

  if (Buffer.byteLength(JSON.stringify(metadataEntrada)) > MAX_METADATA_BYTES) {
    return NextResponse.json(
      { success: false, error: `metadata supera ${MAX_METADATA_BYTES} bytes` },
      { status: 413 }
    );
  }

  const workflow =
    typeof body.workflow === 'string' && WORKFLOW_VALIDO.test(body.workflow)
      ? body.workflow
      : undefined;

  // El origen siempre es n8n: no se puede suplantar el de la aplicación.
  const guardado = await logSystemEvent({
    level: nivel,
    source: 'n8n',
    event: evento.startsWith('N8N_') ? evento : `N8N_${evento}`,
    message: texto(body.message, 500),
    requestId: texto(body.request_id, 100),
    metadata: workflow ? { ...metadataEntrada, workflow } : metadataEntrada,
  });

  if (!guardado) {
    return NextResponse.json(
      { success: false, error: 'No se pudo guardar el log' },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
