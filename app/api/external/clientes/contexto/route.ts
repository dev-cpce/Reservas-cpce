import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   CONFIGURACIÓN SUPABASE
============================================================ */

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Faltan variables de entorno de Supabase");
  }

  return createClient(url, key);
}

/* ============================================================
   VALIDACIÓN API KEY
============================================================ */

function validarApiKey(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  const expectedApiKey = process.env.N8N_API_KEY;

  if (!expectedApiKey) {
    return {
      valido: false,
      status: 500,
      error: "N8N_API_KEY no está configurada en el servidor",
    };
  }

  if (!apiKey || apiKey !== expectedApiKey) {
    return {
      valido: false,
      status: 401,
      error: "No autorizado",
    };
  }

  return {
    valido: true,
    status: 200,
    error: null,
  };
}

/* ============================================================
   TIPOS
============================================================ */

interface UserContextBody {
  chat_id: string;

  fecha?: string | null;
  hora_inicio?: string | null;

  id_recurso?: number | string | null;
  duracion_minutos?: number | string | null;

  id_reserva?: number | string | null;

  accion_pendiente?: string | null;

  /*
   * Campos legacy.
   * Se mantienen temporalmente para no romper
   * nodos antiguos durante la migración.
   */
  tipo_cancha?: string | null;
  cancha_nro?: string | number | null;
}

/* ============================================================
   LIMPIADOR DE VALORES VACÍOS
============================================================ */

function cleanValue<T>(value: T): T | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
}

/* ============================================================
   NORMALIZACIÓN DE NÚMEROS
============================================================ */

function cleanNumber(
  value: number | string | null | undefined
): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return null;
  }

  return numberValue;
}

/* ============================================================
   GET — OBTENER CONTEXTO
============================================================ */

export async function GET(request: NextRequest) {
  try {
    const auth = validarApiKey(request);

    if (!auth.valido) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
        },
        { status: auth.status }
      );
    }

    const chatId = new URL(request.url).searchParams.get("chat_id");

    if (!chatId) {
      return NextResponse.json(
        {
          success: false,
          error: "chat_id requerido",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase
    .from("user_context")
    .select(
      `
    chat_id,
    fecha,
    hora_inicio,
    id_recurso,
    duracion_minutos,
    id_reserva,
    accion_pendiente,
    tipo_cancha,
    cancha_nro,
    updated_at
    `
    )
      .eq("chat_id", chatId)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data ?? null,
      message: data
        ? "Contexto encontrado"
        : "Sin contexto previo",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   POST — CREAR / ACTUALIZAR CONTEXTO
============================================================ */

export async function POST(request: NextRequest) {
  try {
    const auth = validarApiKey(request);

    if (!auth.valido) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
        },
        { status: auth.status }
      );
    }

    const body: UserContextBody = await request.json();

    if (!body.chat_id) {
      return NextResponse.json(
        {
          success: false,
          error: "chat_id es requerido",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    /* ========================================================
       LIMPIAR CAMPOS NUEVOS
    ======================================================== */

    const fecha = cleanValue(body.fecha);
    const hora_inicio = cleanValue(body.hora_inicio);

    const id_recurso = cleanNumber(body.id_recurso);

    const duracion_minutos = cleanNumber(
      body.duracion_minutos
    );

    const id_reserva = cleanNumber(body.id_reserva);

    const accion_pendiente = cleanValue(
      body.accion_pendiente
    );

    /* ========================================================
       VALIDAR DURACIÓN
    ======================================================== */

    if (
      duracion_minutos !== null &&
      duracion_minutos !== 90 &&
      duracion_minutos !== 120
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "duracion_minutos debe ser 90 o 120",
        },
        { status: 400 }
      );
    }

    /* ========================================================
       CAMPOS LEGACY
       
       Se mantienen temporalmente para compatibilidad.
       Cuando usamos el nuevo modelo, los limpiamos para
       evitar que el contexto tenga información contradictoria.
    ======================================================== */

    const tipo_cancha =
      id_recurso !== null
        ? null
        : cleanValue(body.tipo_cancha);

    const cancha_nro =
      id_recurso !== null
        ? null
        : cleanNumber(body.cancha_nro);

    /* ========================================================
       UPSERT
    ======================================================== */

    const { data, error } = await supabase
      .from("user_context")
      .upsert(
        {
          chat_id: body.chat_id,

          fecha,
          hora_inicio,

          id_recurso,
          duracion_minutos,

          id_reserva,

          accion_pendiente,

          /*
           * Legacy
           */
          tipo_cancha,
          cancha_nro,

          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "chat_id",
        }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: "Contexto actualizado correctamente",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}

/* ============================================================
   DELETE — ELIMINAR CONTEXTO
============================================================ */

export async function DELETE(request: NextRequest) {
  try {
    const auth = validarApiKey(request);

    if (!auth.valido) {
      return NextResponse.json(
        {
          success: false,
          error: auth.error,
        },
        { status: auth.status }
      );
    }

    const chatId = new URL(request.url).searchParams.get(
      "chat_id"
    );

    if (!chatId) {
      return NextResponse.json(
        {
          success: false,
          error: "chat_id requerido",
        },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from("user_context")
      .delete()
      .eq("chat_id", chatId);

    if (error) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Contexto eliminado exitosamente",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: "Error interno del servidor",
      },
      { status: 500 }
    );
  }
}