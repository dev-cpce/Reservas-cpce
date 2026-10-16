


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."cliente" (
    "id_cliente" integer NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "apellido" character varying(100) NOT NULL,
    "telefono" character varying(20),
    "fecha_registro" timestamp without time zone DEFAULT "now"(),
    "chat_id" character varying,
    "tipo_cliente" character varying(20) DEFAULT 'NO_SOCIO'::character varying NOT NULL,
    CONSTRAINT "cliente_tipo_cliente_check" CHECK ((("tipo_cliente")::"text" = ANY ((ARRAY['SOCIO'::character varying, 'NO_SOCIO'::character varying])::"text"[])))
);


ALTER TABLE "public"."cliente" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buscar_clientes"("p_query" "text") RETURNS SETOF "public"."cliente"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT c.*
  FROM public.cliente c
  WHERE
    trim(p_query) = ''
    OR extensions.unaccent(coalesce(c.nombre, ''))
      ILIKE '%' || extensions.unaccent(trim(p_query)) || '%'
    OR extensions.unaccent(coalesce(c.apellido, ''))
      ILIKE '%' || extensions.unaccent(trim(p_query)) || '%'
    OR coalesce(c.telefono, '')
      ILIKE '%' || trim(p_query) || '%'
  ORDER BY
    extensions.unaccent(coalesce(c.apellido, '')),
    extensions.unaccent(coalesce(c.nombre, ''));
$$;


ALTER FUNCTION "public"."buscar_clientes"("p_query" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_reserva_recurso"("p_id_cliente" integer, "p_id_recurso" integer, "p_fecha_reserva" "date", "p_hora_inicio" time without time zone, "p_hora_fin" time without time zone, "p_duracion_minutos" integer, "p_costo_reserva" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_recurso_existe BOOLEAN;
    v_conflicto_reserva RECORD;
    v_conflicto_bloqueo RECORD;
    v_id_reserva INT;
    v_fecha_expiracion TIMESTAMPTZ;
BEGIN

    -- ============================================================
    -- 1. LOCK TRANSACCIONAL
    -- Serializa reservas del mismo recurso y fecha.
    -- ============================================================
    PERFORM pg_advisory_xact_lock(
        hashtext(
            'reserva_recurso_' ||
            p_id_recurso::TEXT ||
            '_' ||
            p_fecha_reserva::TEXT
        )
    );

    -- ============================================================
    -- 2. VALIDAR DURACIÃ“N
    -- ============================================================
    IF p_duracion_minutos NOT IN (90, 120) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'DURACION_INVALIDA',
            'message', 'La duraciÃ³n debe ser de 90 o 120 minutos.'
        );
    END IF;

    -- ============================================================
    -- 3. VALIDAR HORARIO
    -- ============================================================
    IF p_hora_fin <= p_hora_inicio THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'HORARIO_INVALIDO',
            'message', 'La hora de fin debe ser posterior a la hora de inicio.'
        );
    END IF;

    -- ============================================================
    -- 4. VALIDAR RECURSO
    -- ============================================================
    SELECT EXISTS (
        SELECT 1
        FROM public.recurso
        WHERE id_recurso = p_id_recurso
          AND activo = TRUE
          AND estado = 'DISPONIBLE'
    )
    INTO v_recurso_existe;

    IF NOT v_recurso_existe THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'RECURSO_NO_DISPONIBLE',
            'message', 'El recurso no existe, estÃ¡ inactivo o no estÃ¡ disponible.'
        );
    END IF;

    -- ============================================================
    -- 5. BUSCAR CONFLICTO CON RESERVAS
    --
    -- CONFIRMADA â†’ siempre bloquea
    -- PENDIENTE + expiraciÃ³n futura â†’ bloquea
    -- PENDIENTE + expiraciÃ³n NULL â†’ bloquea (legacy)
    -- PENDIENTE vencida â†’ no bloquea
    -- CANCELADA â†’ no bloquea
    -- ============================================================
    SELECT
        id_reserva,
        hora_inicio,
        hora_fin,
        estado_reserva
    INTO v_conflicto_reserva
    FROM public.reserva
    WHERE id_recurso = p_id_recurso
      AND fecha_reserva = p_fecha_reserva
      AND estado_reserva != 'cancelada'
      AND (
          estado_reserva = 'confirmada'
          OR (
              estado_reserva = 'pendiente'
              AND (
                  fecha_expiracion_pago IS NULL
                  OR fecha_expiracion_pago > NOW()
              )
          )
      )
      AND (
          p_hora_inicio < hora_fin
          AND p_hora_fin > hora_inicio
      )
    ORDER BY hora_inicio ASC
    LIMIT 1;

    IF v_conflicto_reserva.id_reserva IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CONFLICTO_RESERVA',
            'message', 'El recurso ya tiene una reserva en ese horario.',
            'detalle', jsonb_build_object(
                'id_reserva_conflicto',
                    v_conflicto_reserva.id_reserva,
                'hora_inicio',
                    to_char(v_conflicto_reserva.hora_inicio, 'HH24:MI'),
                'hora_fin',
                    to_char(v_conflicto_reserva.hora_fin, 'HH24:MI'),
                'estado',
                    v_conflicto_reserva.estado_reserva
            )
        );
    END IF;

    -- ============================================================
    -- 6. BUSCAR CONFLICTO CON BLOQUEOS
    -- ============================================================
    SELECT
        id_bloqueo,
        hora_inicio,
        hora_fin,
        motivo
    INTO v_conflicto_bloqueo
    FROM public.recurso_bloqueo
    WHERE id_recurso = p_id_recurso
      AND fecha = p_fecha_reserva
      AND activo = TRUE
      AND (
          p_hora_inicio < hora_fin
          AND p_hora_fin > hora_inicio
      )
    ORDER BY hora_inicio ASC
    LIMIT 1;

    IF v_conflicto_bloqueo.id_bloqueo IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CONFLICTO_BLOQUEO',
            'message', 'El recurso tiene un bloqueo activo en ese horario.',
            'detalle', jsonb_build_object(
                'id_bloqueo_conflicto',
                    v_conflicto_bloqueo.id_bloqueo,
                'hora_inicio',
                    to_char(v_conflicto_bloqueo.hora_inicio, 'HH24:MI'),
                'hora_fin',
                    to_char(v_conflicto_bloqueo.hora_fin, 'HH24:MI'),
                'motivo',
                    v_conflicto_bloqueo.motivo
            )
        );
    END IF;

    -- ============================================================
    -- 7. CREAR RESERVA PENDIENTE
    -- La expiraciÃ³n se calcula directamente en PostgreSQL.
    -- ============================================================
    v_fecha_expiracion :=
        NOW() + INTERVAL '5 minutes';

    INSERT INTO public.reserva (
        id_cliente,
        id_recurso,
        fecha_reserva,
        hora_inicio,
        hora_fin,
        duracion_minutos,
        estado_reserva,
        costo_reserva,
        fecha_expiracion_pago
    )
    VALUES (
        p_id_cliente,
        p_id_recurso,
        p_fecha_reserva,
        p_hora_inicio,
        p_hora_fin,
        p_duracion_minutos,
        'pendiente',
        p_costo_reserva,
        v_fecha_expiracion
    )
    RETURNING id_reserva
    INTO v_id_reserva;

    -- ============================================================
    -- 8. RESPUESTA EXITOSA
    -- ============================================================
    RETURN jsonb_build_object(
        'success', true,
        'id_reserva', v_id_reserva,
        'fecha_expiracion_pago', v_fecha_expiracion
    );

END;
$$;


ALTER FUNCTION "public"."crear_reserva_recurso"("p_id_cliente" integer, "p_id_recurso" integer, "p_fecha_reserva" "date", "p_hora_inicio" time without time zone, "p_hora_fin" time without time zone, "p_duracion_minutos" integer, "p_costo_reserva" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cliente_id_cliente_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cliente_id_cliente_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cliente_id_cliente_seq" OWNED BY "public"."cliente"."id_cliente";



CREATE TABLE IF NOT EXISTS "public"."cliente_pendiente" (
    "id_cliente_pendiente" bigint NOT NULL,
    "chat_id" bigint NOT NULL,
    "esperando" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "actualizado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cliente_pendiente" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."cliente_pendiente_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."cliente_pendiente_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."cliente_pendiente_id_seq" OWNED BY "public"."cliente_pendiente"."id_cliente_pendiente";



CREATE TABLE IF NOT EXISTS "public"."conversacion" (
    "id" bigint NOT NULL,
    "chat_id" "text" NOT NULL,
    "id_cliente" integer,
    "modo" "text" DEFAULT 'bot'::"text" NOT NULL,
    "no_leidos" integer DEFAULT 0 NOT NULL,
    "ultimo_mensaje_at" timestamp with time zone,
    "ultimo_mensaje_cliente_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "conversacion_modo_check" CHECK (("modo" = ANY (ARRAY['bot'::"text", 'humano'::"text"]))),
    CONSTRAINT "conversacion_no_leidos_check" CHECK (("no_leidos" >= 0))
);


ALTER TABLE "public"."conversacion" OWNER TO "postgres";


COMMENT ON TABLE "public"."conversacion" IS 'Conversaciones de WhatsApp de ReservaYA.';



COMMENT ON COLUMN "public"."conversacion"."modo" IS 'bot: responde el asistente; humano: atenciÃ³n manual.';



ALTER TABLE "public"."conversacion" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."conversacion_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."mensaje" (
    "id" bigint NOT NULL,
    "id_conversacion" bigint NOT NULL,
    "wa_message_id" "text",
    "direccion" "text" NOT NULL,
    "origen" "text" NOT NULL,
    "tipo_contenido" "text" DEFAULT 'texto'::"text" NOT NULL,
    "texto" "text",
    "payload" "jsonb",
    "estado" "text" NOT NULL,
    "error_detalle" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mensaje_direccion_check" CHECK (("direccion" = ANY (ARRAY['entrante'::"text", 'saliente'::"text"]))),
    CONSTRAINT "mensaje_direccion_origen_check" CHECK (((("direccion" = 'entrante'::"text") AND ("origen" = 'cliente'::"text")) OR (("direccion" = 'saliente'::"text") AND ("origen" = ANY (ARRAY['bot'::"text", 'empleado'::"text"]))))),
    CONSTRAINT "mensaje_estado_check" CHECK (("estado" = ANY (ARRAY['recibido'::"text", 'enviado'::"text", 'entregado'::"text", 'leido'::"text", 'fallido'::"text"]))),
    CONSTRAINT "mensaje_origen_check" CHECK (("origen" = ANY (ARRAY['cliente'::"text", 'bot'::"text", 'empleado'::"text"]))),
    CONSTRAINT "mensaje_tipo_contenido_check" CHECK (("tipo_contenido" = ANY (ARRAY['texto'::"text", 'imagen'::"text", 'audio'::"text", 'video'::"text", 'documento'::"text", 'sticker'::"text", 'ubicacion'::"text", 'interactivo'::"text", 'otro'::"text"])))
);


ALTER TABLE "public"."mensaje" OWNER TO "postgres";


COMMENT ON TABLE "public"."mensaje" IS 'Historial de mensajes entrantes y salientes de WhatsApp.';



COMMENT ON COLUMN "public"."mensaje"."wa_message_id" IS 'Identificador del mensaje asignado por WhatsApp Cloud API.';



COMMENT ON COLUMN "public"."mensaje"."origen" IS 'cliente: entrante; bot: asistente virtual; empleado: respuesta manual.';



ALTER TABLE "public"."mensaje" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."mensaje_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pago" (
    "id_pago" integer NOT NULL,
    "id_reserva" integer NOT NULL,
    "monto" numeric(10,2) NOT NULL,
    "estado_pago" character varying(50) DEFAULT 'Pendiente'::character varying,
    "mp_id" character varying(255),
    "fecha_pago" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."pago" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pago_id_pago_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pago_id_pago_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."pago_id_pago_seq" OWNED BY "public"."pago"."id_pago";



CREATE TABLE IF NOT EXISTS "public"."perfiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text",
    "apellido" "text",
    "rol" "text" DEFAULT 'EMPLEADO'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "perfiles_rol_check" CHECK (("rol" = ANY (ARRAY['ADMIN'::"text", 'GERENCIA'::"text", 'EMPLEADO'::"text"])))
);


ALTER TABLE "public"."perfiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurso" (
    "id_recurso" bigint NOT NULL,
    "nombre" character varying(100) NOT NULL,
    "tipo_recurso" character varying(30) NOT NULL,
    "deporte" character varying(30),
    "capacidad" integer,
    "estado" character varying(30) DEFAULT 'DISPONIBLE'::character varying NOT NULL,
    "descripcion" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurso_capacidad_check" CHECK ((("capacidad" IS NULL) OR ("capacidad" > 0))),
    CONSTRAINT "recurso_deporte_check" CHECK ((("deporte" IS NULL) OR (("deporte")::"text" = ANY ((ARRAY['PADEL'::character varying, 'FUTBOL'::character varying, 'TENIS'::character varying, 'BASQUET'::character varying, 'OTRO'::character varying])::"text"[])))),
    CONSTRAINT "recurso_estado_check" CHECK ((("estado")::"text" = ANY ((ARRAY['DISPONIBLE'::character varying, 'MANTENIMIENTO'::character varying, 'FUERA_SERVICIO'::character varying])::"text"[]))),
    CONSTRAINT "recurso_tipo_recurso_check" CHECK ((("tipo_recurso")::"text" = ANY ((ARRAY['CANCHA'::character varying, 'QUINCHO'::character varying, 'SALON'::character varying, 'PILETA'::character varying, 'OTRO'::character varying])::"text"[])))
);


ALTER TABLE "public"."recurso" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurso_bloqueo" (
    "id_bloqueo" bigint NOT NULL,
    "id_recurso" bigint NOT NULL,
    "fecha" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fin" time without time zone NOT NULL,
    "motivo" "text",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurso_bloqueo_horas_check" CHECK (("hora_fin" > "hora_inicio"))
);


ALTER TABLE "public"."recurso_bloqueo" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."recurso_bloqueo_id_bloqueo_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."recurso_bloqueo_id_bloqueo_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."recurso_bloqueo_id_bloqueo_seq" OWNED BY "public"."recurso_bloqueo"."id_bloqueo";



CREATE TABLE IF NOT EXISTS "public"."recurso_horario" (
    "id_horario" bigint NOT NULL,
    "id_recurso" bigint NOT NULL,
    "dia_semana" smallint NOT NULL,
    "hora_apertura" time without time zone NOT NULL,
    "hora_cierre" time without time zone NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "recurso_horario_dia_check" CHECK ((("dia_semana" >= 0) AND ("dia_semana" <= 6))),
    CONSTRAINT "recurso_horario_horas_check" CHECK (("hora_cierre" > "hora_apertura"))
);


ALTER TABLE "public"."recurso_horario" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."recurso_horario_id_horario_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."recurso_horario_id_horario_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."recurso_horario_id_horario_seq" OWNED BY "public"."recurso_horario"."id_horario";



CREATE SEQUENCE IF NOT EXISTS "public"."recurso_id_recurso_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."recurso_id_recurso_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."recurso_id_recurso_seq" OWNED BY "public"."recurso"."id_recurso";



CREATE TABLE IF NOT EXISTS "public"."reserva" (
    "id_reserva" integer NOT NULL,
    "id_cliente" integer NOT NULL,
    "fecha_reserva" "date" NOT NULL,
    "hora_inicio" time without time zone NOT NULL,
    "hora_fin" time without time zone NOT NULL,
    "estado_reserva" character varying(50) DEFAULT 'pendiente'::character varying,
    "costo_reserva" numeric(10,2) DEFAULT 0.00,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "id_recurso" bigint,
    "duracion_minutos" integer,
    "fecha_expiracion_pago" timestamp with time zone,
    CONSTRAINT "reserva_duracion_check" CHECK ((("duracion_minutos" IS NULL) OR ("duracion_minutos" > 0)))
);


ALTER TABLE "public"."reserva" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."reserva_id_reserva_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."reserva_id_reserva_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."reserva_id_reserva_seq" OWNED BY "public"."reserva"."id_reserva";



CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "level" "text" DEFAULT 'info'::"text" NOT NULL,
    "source" "text" NOT NULL,
    "event" "text" NOT NULL,
    "message" "text",
    "request_id" "text",
    "user_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "system_logs_level_check" CHECK (("level" = ANY (ARRAY['info'::"text", 'warning'::"text", 'error'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


ALTER TABLE "public"."system_logs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."system_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."tarifa" (
    "id_tarifa" bigint NOT NULL,
    "id_recurso" bigint NOT NULL,
    "tipo_cliente" character varying(20) NOT NULL,
    "duracion_minutos" integer NOT NULL,
    "precio" numeric(12,2) NOT NULL,
    "vigente_desde" "date",
    "vigente_hasta" "date",
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tarifa_duracion_check" CHECK (("duracion_minutos" > 0)),
    CONSTRAINT "tarifa_precio_check" CHECK (("precio" >= (0)::numeric)),
    CONSTRAINT "tarifa_tipo_cliente_check" CHECK ((("tipo_cliente")::"text" = ANY ((ARRAY['SOCIO'::character varying, 'NO_SOCIO'::character varying])::"text"[]))),
    CONSTRAINT "tarifa_vigencia_check" CHECK ((("vigente_hasta" IS NULL) OR ("vigente_desde" IS NULL) OR ("vigente_hasta" >= "vigente_desde")))
);


ALTER TABLE "public"."tarifa" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tarifa_id_tarifa_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tarifa_id_tarifa_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tarifa_id_tarifa_seq" OWNED BY "public"."tarifa"."id_tarifa";



CREATE TABLE IF NOT EXISTS "public"."user_context" (
    "chat_id" "text" NOT NULL,
    "fecha" "date",
    "hora_inicio" time without time zone,
    "accion_pendiente" "text" DEFAULT 'none'::"text",
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "id_recurso" integer,
    "duracion_minutos" integer,
    "id_reserva" integer,
    CONSTRAINT "user_context_accion_pendiente_check" CHECK (("accion_pendiente" = ANY (ARRAY['none'::"text", 'esperando_datos_reserva'::"text", 'esperando_confirmacion_cancelacion'::"text", 'esperando_detalles'::"text", 'esperando_confirmacion'::"text", 'esperando_pago'::"text"]))),
    CONSTRAINT "user_context_duracion_check" CHECK ((("duracion_minutos" IS NULL) OR ("duracion_minutos" = ANY (ARRAY[90, 120]))))
);


ALTER TABLE "public"."user_context" OWNER TO "postgres";


ALTER TABLE ONLY "public"."cliente" ALTER COLUMN "id_cliente" SET DEFAULT "nextval"('"public"."cliente_id_cliente_seq"'::"regclass");



ALTER TABLE ONLY "public"."cliente_pendiente" ALTER COLUMN "id_cliente_pendiente" SET DEFAULT "nextval"('"public"."cliente_pendiente_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."pago" ALTER COLUMN "id_pago" SET DEFAULT "nextval"('"public"."pago_id_pago_seq"'::"regclass");



ALTER TABLE ONLY "public"."recurso" ALTER COLUMN "id_recurso" SET DEFAULT "nextval"('"public"."recurso_id_recurso_seq"'::"regclass");



ALTER TABLE ONLY "public"."recurso_bloqueo" ALTER COLUMN "id_bloqueo" SET DEFAULT "nextval"('"public"."recurso_bloqueo_id_bloqueo_seq"'::"regclass");



ALTER TABLE ONLY "public"."recurso_horario" ALTER COLUMN "id_horario" SET DEFAULT "nextval"('"public"."recurso_horario_id_horario_seq"'::"regclass");



ALTER TABLE ONLY "public"."reserva" ALTER COLUMN "id_reserva" SET DEFAULT "nextval"('"public"."reserva_id_reserva_seq"'::"regclass");



ALTER TABLE ONLY "public"."tarifa" ALTER COLUMN "id_tarifa" SET DEFAULT "nextval"('"public"."tarifa_id_tarifa_seq"'::"regclass");



ALTER TABLE ONLY "public"."cliente"
    ADD CONSTRAINT "cliente_chat_id_key" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."cliente_pendiente"
    ADD CONSTRAINT "cliente_pendiente_pkey" PRIMARY KEY ("id_cliente_pendiente");



ALTER TABLE ONLY "public"."cliente"
    ADD CONSTRAINT "cliente_pkey" PRIMARY KEY ("id_cliente");



ALTER TABLE ONLY "public"."conversacion"
    ADD CONSTRAINT "conversacion_chat_id_key" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."conversacion"
    ADD CONSTRAINT "conversacion_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mensaje"
    ADD CONSTRAINT "mensaje_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pago"
    ADD CONSTRAINT "pago_id_reserva_key" UNIQUE ("id_reserva");



ALTER TABLE ONLY "public"."pago"
    ADD CONSTRAINT "pago_pkey" PRIMARY KEY ("id_pago");



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurso_bloqueo"
    ADD CONSTRAINT "recurso_bloqueo_pkey" PRIMARY KEY ("id_bloqueo");



ALTER TABLE ONLY "public"."recurso_horario"
    ADD CONSTRAINT "recurso_horario_pkey" PRIMARY KEY ("id_horario");



ALTER TABLE ONLY "public"."recurso"
    ADD CONSTRAINT "recurso_pkey" PRIMARY KEY ("id_recurso");



ALTER TABLE ONLY "public"."reserva"
    ADD CONSTRAINT "reserva_pkey" PRIMARY KEY ("id_reserva");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarifa"
    ADD CONSTRAINT "tarifa_pkey" PRIMARY KEY ("id_tarifa");



ALTER TABLE ONLY "public"."cliente_pendiente"
    ADD CONSTRAINT "un_chat_pendiente" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."user_context"
    ADD CONSTRAINT "user_context_chat_id_key" UNIQUE ("chat_id");



ALTER TABLE ONLY "public"."user_context"
    ADD CONSTRAINT "user_context_pkey" PRIMARY KEY ("chat_id");



CREATE INDEX "idx_conversacion_actividad" ON "public"."conversacion" USING "btree" ("ultimo_mensaje_at" DESC NULLS LAST);



CREATE INDEX "idx_conversacion_cliente" ON "public"."conversacion" USING "btree" ("id_cliente");



CREATE INDEX "idx_mensaje_conversacion_fecha" ON "public"."mensaje" USING "btree" ("id_conversacion", "created_at" DESC, "id" DESC);



CREATE UNIQUE INDEX "idx_mensaje_wa_message_id" ON "public"."mensaje" USING "btree" ("wa_message_id") WHERE ("wa_message_id" IS NOT NULL);



CREATE INDEX "idx_recurso_activo" ON "public"."recurso" USING "btree" ("activo");



CREATE INDEX "idx_recurso_bloqueo_recurso_fecha" ON "public"."recurso_bloqueo" USING "btree" ("id_recurso", "fecha");



CREATE INDEX "idx_recurso_deporte" ON "public"."recurso" USING "btree" ("deporte");



CREATE INDEX "idx_recurso_horario_recurso" ON "public"."recurso_horario" USING "btree" ("id_recurso");



CREATE INDEX "idx_recurso_tipo" ON "public"."recurso" USING "btree" ("tipo_recurso");



CREATE INDEX "idx_reserva_pendiente_expiracion" ON "public"."reserva" USING "btree" ("fecha_expiracion_pago");



CREATE INDEX "idx_reserva_recurso_fecha" ON "public"."reserva" USING "btree" ("id_recurso", "fecha_reserva");



CREATE INDEX "idx_system_logs_created_at" ON "public"."system_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_system_logs_event" ON "public"."system_logs" USING "btree" ("event");



CREATE INDEX "idx_system_logs_level" ON "public"."system_logs" USING "btree" ("level");



CREATE INDEX "idx_system_logs_request_id" ON "public"."system_logs" USING "btree" ("request_id");



CREATE INDEX "idx_system_logs_source" ON "public"."system_logs" USING "btree" ("source");



CREATE INDEX "idx_system_logs_user_id" ON "public"."system_logs" USING "btree" ("user_id");



CREATE INDEX "idx_tarifa_busqueda" ON "public"."tarifa" USING "btree" ("id_recurso", "tipo_cliente", "duracion_minutos", "activo");



CREATE INDEX "idx_tarifa_recurso" ON "public"."tarifa" USING "btree" ("id_recurso");



CREATE OR REPLACE TRIGGER "update_reserva_updated_at" BEFORE UPDATE ON "public"."reserva" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."conversacion"
    ADD CONSTRAINT "conversacion_id_cliente_fkey" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id_cliente") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reserva"
    ADD CONSTRAINT "fk_cliente" FOREIGN KEY ("id_cliente") REFERENCES "public"."cliente"("id_cliente") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pago"
    ADD CONSTRAINT "fk_reserva" FOREIGN KEY ("id_reserva") REFERENCES "public"."reserva"("id_reserva") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mensaje"
    ADD CONSTRAINT "mensaje_id_conversacion_fkey" FOREIGN KEY ("id_conversacion") REFERENCES "public"."conversacion"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."perfiles"
    ADD CONSTRAINT "perfiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurso_bloqueo"
    ADD CONSTRAINT "recurso_bloqueo_recurso_fk" FOREIGN KEY ("id_recurso") REFERENCES "public"."recurso"("id_recurso") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."recurso_horario"
    ADD CONSTRAINT "recurso_horario_recurso_fk" FOREIGN KEY ("id_recurso") REFERENCES "public"."recurso"("id_recurso") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reserva"
    ADD CONSTRAINT "reserva_recurso_fk" FOREIGN KEY ("id_recurso") REFERENCES "public"."recurso"("id_recurso") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tarifa"
    ADD CONSTRAINT "tarifa_recurso_fk" FOREIGN KEY ("id_recurso") REFERENCES "public"."recurso"("id_recurso") ON UPDATE CASCADE ON DELETE RESTRICT;



CREATE POLICY "Solo ADMIN puede ver system_logs" ON "public"."system_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."perfiles"
  WHERE (("perfiles"."id" = "auth"."uid"()) AND ("perfiles"."rol" = 'ADMIN'::"text")))));



CREATE POLICY "Usuarios autenticados pueden crear bloqueos" ON "public"."recurso_bloqueo" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden crear recursos" ON "public"."recurso" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden eliminar bloqueos" ON "public"."recurso_bloqueo" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden eliminar recursos" ON "public"."recurso" FOR DELETE TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden leer clientes" ON "public"."cliente" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden leer contexto" ON "public"."user_context" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden leer pago" ON "public"."pago" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden leer pendientes" ON "public"."cliente_pendiente" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden leer reservas" ON "public"."reserva" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden modificar bloqueos" ON "public"."recurso_bloqueo" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden modificar clientes" ON "public"."cliente" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden modificar contexto" ON "public"."user_context" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden modificar pago" ON "public"."pago" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden modificar pendientes" ON "public"."cliente_pendiente" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden modificar recursos" ON "public"."recurso" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden modificar reservas" ON "public"."reserva" TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Usuarios autenticados pueden ver bloqueos de recursos" ON "public"."recurso_bloqueo" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden ver conversaciones" ON "public"."conversacion" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden ver horarios de recursos" ON "public"."recurso_horario" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden ver mensajes" ON "public"."mensaje" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden ver recursos" ON "public"."recurso" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios autenticados pueden ver tarifas" ON "public"."tarifa" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Usuarios pueden ver su propio perfil" ON "public"."perfiles" FOR SELECT TO "authenticated" USING (("auth"."uid"() = "id"));



ALTER TABLE "public"."cliente" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cliente_pendiente" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversacion" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."mensaje" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pago" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."perfiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurso" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurso_bloqueo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurso_horario" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reserva" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tarifa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_context" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."cliente";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."conversacion";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."mensaje";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."pago";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."reserva";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




















































































































































































GRANT ALL ON TABLE "public"."cliente" TO "anon";
GRANT ALL ON TABLE "public"."cliente" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente" TO "service_role";



GRANT ALL ON FUNCTION "public"."buscar_clientes"("p_query" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."buscar_clientes"("p_query" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."buscar_clientes"("p_query" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."crear_reserva_recurso"("p_id_cliente" integer, "p_id_recurso" integer, "p_fecha_reserva" "date", "p_hora_inicio" time without time zone, "p_hora_fin" time without time zone, "p_duracion_minutos" integer, "p_costo_reserva" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."crear_reserva_recurso"("p_id_cliente" integer, "p_id_recurso" integer, "p_fecha_reserva" "date", "p_hora_inicio" time without time zone, "p_hora_fin" time without time zone, "p_duracion_minutos" integer, "p_costo_reserva" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."crear_reserva_recurso"("p_id_cliente" integer, "p_id_recurso" integer, "p_fecha_reserva" "date", "p_hora_inicio" time without time zone, "p_hora_fin" time without time zone, "p_duracion_minutos" integer, "p_costo_reserva" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";





















GRANT ALL ON SEQUENCE "public"."cliente_id_cliente_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cliente_id_cliente_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cliente_id_cliente_seq" TO "service_role";



GRANT ALL ON TABLE "public"."cliente_pendiente" TO "anon";
GRANT ALL ON TABLE "public"."cliente_pendiente" TO "authenticated";
GRANT ALL ON TABLE "public"."cliente_pendiente" TO "service_role";



GRANT ALL ON SEQUENCE "public"."cliente_pendiente_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."cliente_pendiente_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."cliente_pendiente_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."conversacion" TO "authenticated";
GRANT ALL ON TABLE "public"."conversacion" TO "service_role";



GRANT ALL ON SEQUENCE "public"."conversacion_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."conversacion_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."conversacion_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."mensaje" TO "authenticated";
GRANT ALL ON TABLE "public"."mensaje" TO "service_role";



GRANT ALL ON SEQUENCE "public"."mensaje_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."mensaje_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."mensaje_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pago" TO "anon";
GRANT ALL ON TABLE "public"."pago" TO "authenticated";
GRANT ALL ON TABLE "public"."pago" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pago_id_pago_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pago_id_pago_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pago_id_pago_seq" TO "service_role";



GRANT ALL ON TABLE "public"."perfiles" TO "anon";
GRANT ALL ON TABLE "public"."perfiles" TO "authenticated";
GRANT ALL ON TABLE "public"."perfiles" TO "service_role";



GRANT ALL ON TABLE "public"."recurso" TO "anon";
GRANT ALL ON TABLE "public"."recurso" TO "authenticated";
GRANT ALL ON TABLE "public"."recurso" TO "service_role";



GRANT ALL ON TABLE "public"."recurso_bloqueo" TO "anon";
GRANT ALL ON TABLE "public"."recurso_bloqueo" TO "authenticated";
GRANT ALL ON TABLE "public"."recurso_bloqueo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recurso_bloqueo_id_bloqueo_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recurso_bloqueo_id_bloqueo_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recurso_bloqueo_id_bloqueo_seq" TO "service_role";



GRANT ALL ON TABLE "public"."recurso_horario" TO "anon";
GRANT ALL ON TABLE "public"."recurso_horario" TO "authenticated";
GRANT ALL ON TABLE "public"."recurso_horario" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recurso_horario_id_horario_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recurso_horario_id_horario_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recurso_horario_id_horario_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."recurso_id_recurso_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."recurso_id_recurso_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."recurso_id_recurso_seq" TO "service_role";



GRANT ALL ON TABLE "public"."reserva" TO "anon";
GRANT ALL ON TABLE "public"."reserva" TO "authenticated";
GRANT ALL ON TABLE "public"."reserva" TO "service_role";



GRANT ALL ON SEQUENCE "public"."reserva_id_reserva_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."reserva_id_reserva_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."reserva_id_reserva_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_logs_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tarifa" TO "anon";
GRANT ALL ON TABLE "public"."tarifa" TO "authenticated";
GRANT ALL ON TABLE "public"."tarifa" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tarifa_id_tarifa_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tarifa_id_tarifa_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tarifa_id_tarifa_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_context" TO "anon";
GRANT ALL ON TABLE "public"."user_context" TO "authenticated";
GRANT ALL ON TABLE "public"."user_context" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
































