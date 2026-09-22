import { NextRequest } from "next/server";

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

const N8N_WEBHOOK_URL =
  "https://n8n-lucas.acostaparra.com/webhook-test/whatsapp";

// =====================================================
// GET - Verificación de Meta
// =====================================================
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  console.log("Webhook verification:", {
    mode,
    token,
    challenge,
  });

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return new Response(challenge, {
      status: 200,
    });
  }

  return new Response("Forbidden", {
    status: 403,
  });
}

// =====================================================
// POST - Mensajes de WhatsApp
// =====================================================
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    console.log("POST recibido en /api/whatsapp");

    if (!rawBody.trim()) {
      return Response.json(
        {
          ok: true,
          mensaje: "POST recibido sin body",
        },
        { status: 200 }
      );
    }

    const body = JSON.parse(rawBody);

    // =====================================================
    // Buscar mensaje de WhatsApp
    // =====================================================

    const value =
      body?.entry?.[0]?.changes?.[0]?.value;

    const message =
      value?.messages?.[0];

    if (!message) {
      console.log("Evento sin mensaje.");

      return Response.json(
        {
          ok: true,
          mensaje: "Evento sin mensaje",
        },
        { status: 200 }
      );
    }

    // =====================================================
    // Datos que necesitamos
    // =====================================================

    // Número que envió el mensaje
    const telefono = message?.from;

    // ID de WhatsApp del contacto
    const chat_id =
      value?.contacts?.[0]?.wa_id;

    // Tipo original del mensaje de WhatsApp
    const whatsappType = message?.type;

    // =====================================================
    // Determinar tipo para n8n
    // =====================================================

    const type =
      whatsappType === "text"
        ? "text"
        : "multimedia";

    // =====================================================
    // Obtener texto solamente si es un mensaje de texto
    // =====================================================

    const texto =
      whatsappType === "text"
        ? message?.text?.body
        : null;

    console.log("CHAT_ID:", chat_id);
    console.log("TELÉFONO:", telefono);
    console.log("TIPO WHATSAPP:", whatsappType);
    console.log("TIPO:", type);
    console.log("MENSAJE:", texto);

    // =====================================================
    // JSON que enviamos a n8n
    // =====================================================

    const data = {
      chat_id,
      telefono,
      mensaje: texto,
      type,
    };

    // =====================================================
    // Enviar a n8n
    // =====================================================

    await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    // =====================================================
    // Respuesta
    // =====================================================

    return Response.json(data, {
      status: 200,
    });

  } catch (error) {
    console.error("Webhook error:", error);

    return Response.json(
      {
        error: "Error procesando webhook",
      },
      { status: 400 }
    );
  }
}