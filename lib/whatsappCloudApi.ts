import 'server-only';

// Cliente mínimo para enviar mensajes de texto por WhatsApp Cloud API (Graph API).
// Solo se usa desde rutas de servidor; el token nunca se expone al cliente.

const ERROR_MAX_LENGTH = 500;

export interface EnviarTextoWhatsAppResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

interface GraphApiErrorBody {
  error?: {
    message?: string;
    error_data?: { details?: string };
  };
}

interface GraphApiSuccessBody {
  messages?: { id?: string }[];
}

export async function enviarTextoWhatsApp(
  to: string,
  texto: string
): Promise<EnviarTextoWhatsAppResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION;

  if (!token || !phoneNumberId || !apiVersion) {
    return {
      ok: false,
      error:
        'Faltan variables de entorno de WhatsApp (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION)',
    };
  }

  try {
    const respuesta = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { preview_url: false, body: texto },
        }),
      }
    );

    const cuerpo = await respuesta
      .json()
      .catch(() => null) as (GraphApiErrorBody & GraphApiSuccessBody) | null;

    if (!respuesta.ok) {
      const mensajeError =
        cuerpo?.error?.message ||
        cuerpo?.error?.error_data?.details ||
        `Graph API respondió con status ${respuesta.status}`;

      return { ok: false, error: String(mensajeError).slice(0, ERROR_MAX_LENGTH) };
    }

    const waMessageId = cuerpo?.messages?.[0]?.id;

    if (!waMessageId) {
      return { ok: false, error: 'Graph API no devolvió un wa_message_id en la respuesta' };
    }

    return { ok: true, waMessageId };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : 'error desconocido';

    return {
      ok: false,
      error: `Error de red al contactar la Graph API: ${detalle}`.slice(0, ERROR_MAX_LENGTH),
    };
  }
}
