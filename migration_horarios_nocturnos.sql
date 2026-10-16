-- ============================================================================
-- Migración: soporte de horarios que cruzan la medianoche (Pádel 1 y Pádel 2)
-- ============================================================================
-- Ejecutar manualmente en Supabase (SQL editor / psql), EN ESTE ORDEN:
--   1) Sección 1: relajar el constraint de recurso_horario.
--   2) Sección 2: cargar/actualizar los horarios de id_recurso IN (1, 2).
--   3) Sección 3: reemplazar la función crear_reserva_recurso.
--
-- Horario requerido (America/Argentina/Buenos_Aires):
--   Domingo a miércoles (dia_semana 0,1,2,3): 08:00 -> 00:00 (día siguiente)
--   Jueves a sábado    (dia_semana 4,5,6)   : 08:00 -> 01:00 (día siguiente)
--   dia_semana sigue la convención de JS Date.getDay() (0 = domingo).
--
-- NOTA: la Sección 3 se basa en el cuerpo REAL de `crear_reserva_recurso`
-- obtenido con `pg_get_functiondef` desde Supabase (firma completa,
-- incluyendo `SET search_path TO 'public', 'pg_temp'`), no en una
-- reconstrucción a ciegas. Firma confirmada y preservada tal cual:
-- public.crear_reserva_recurso(p_id_cliente integer, p_id_recurso integer,
-- p_fecha_reserva date, p_hora_inicio time without time zone, p_hora_fin
-- time without time zone, p_duracion_minutos integer, p_costo_reserva
-- numeric) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
-- SET search_path TO 'public', 'pg_temp'.
--
-- Cambios respecto del original, y por qué:
--   * El original validaba horario solo con `hora_fin <= hora_inicio` (nunca
--     consultaba `recurso_horario`), por lo que la ventana de atención NO se
--     validaba en el servidor; además esa comparación rechaza directamente
--     cualquier reserva nocturna real (23:00-01:00, 22:30-00:00). Se agregó
--     la validación contra `recurso_horario` (apertura/cierre del día,
--     soportando cierre al día siguiente) bajo el mismo error_code
--     'HORARIO_INVALIDO' que ya usaba el original (no se inventan códigos).
--   * El lock transaccional original era por (id_recurso, fecha_reserva).
--     Como una reserva nocturna puede ocupar minutos de fecha-1 o fecha+1,
--     dos transacciones concurrentes sobre fechas consecutivas del MISMO
--     recurso podrían no serializarse entre sí con esa clave y colar un
--     doble-booking en el borde de medianoche. Se cambia el lock a nivel de
--     id_recurso únicamente (sin fecha), que sigue siendo válido para el
--     caso no nocturno y además cubre el caso nocturno.
--   * Las búsquedas de conflicto (reservas y bloqueos) filtraban solo por
--     `fecha_reserva`/`fecha` = p_fecha_reserva. Se extendieron a
--     fecha-1/fecha/fecha+1 comparando con aritmética de timestamp absoluta
--     (fecha + hora, con +1 día si hora_fin <= hora_inicio de esa fila), para
--     detectar reservas/bloqueos nocturnos que invaden el día siguiente.
--   * Se preserva el resto tal cual: duración solo 90/120, recurso
--     activo+DISPONIBLE, jerarquía confirmada/pendiente con expiración,
--     bloqueos activos, inserción en estado 'pendiente' con expiración de
--     pago a 5 minutos, el detalle (`detalle`) de la fila en conflicto en
--     la respuesta de error, y `fecha_expiracion_pago` en la respuesta
--     exitosa.
--
-- SUPUESTO A VERIFICAR POR EL EQUIPO ANTES DE EJECUTAR:
--   * Se asume que `recurso_horario` NO tiene una restricción UNIQUE sobre
--     (id_recurso, dia_semana); por eso el seed (Sección 2) usa
--     IF EXISTS/UPDATE/INSERT en vez de ON CONFLICT, para no fallar si esa
--     restricción no existe.
-- ============================================================================


-- ============================================================================
-- SECCIÓN 1: Constraint de recurso_horario
-- ============================================================================
-- El constraint actual exige hora_cierre > hora_apertura, lo que impide
-- guardar "00:00"/"01:00" como cierre de un día que abre a las 08:00. Se
-- relaja a "distinto de apertura" (solo evita un día de duración cero);
-- la validez de los valores de horario queda a cargo de la aplicación y de
-- crear_reserva_recurso (Sección 3), que interpreta hora_cierre <= hora_apertura
-- como un cierre al día siguiente.

ALTER TABLE recurso_horario
  DROP CONSTRAINT IF EXISTS recurso_horario_horas_check;

ALTER TABLE recurso_horario
  ADD CONSTRAINT recurso_horario_horas_check CHECK (hora_cierre <> hora_apertura);


-- ============================================================================
-- SECCIÓN 2: Horarios de Pádel 1 y Pádel 2 (id_recurso IN (1, 2))
-- ============================================================================
-- Domingo(0) a miércoles(3): 08:00 -> 00:00 (día siguiente)
-- Jueves(4) a sábado(6):     08:00 -> 01:00 (día siguiente)
-- Usa UPDATE/INSERT condicional para no asumir una UNIQUE constraint sobre
-- (id_recurso, dia_semana) y evitar duplicar filas si ya existen.

DO $$
DECLARE
  v_id_recurso INTEGER;
  v_dia_semana INTEGER;
  v_hora_cierre TIME;
BEGIN
  FOREACH v_id_recurso IN ARRAY ARRAY[1, 2]
  LOOP
    FOR v_dia_semana IN 0..6 LOOP
      v_hora_cierre := CASE
        WHEN v_dia_semana IN (0, 1, 2, 3) THEN TIME '00:00'
        ELSE TIME '01:00'
      END;

      IF EXISTS (
        SELECT 1 FROM recurso_horario
        WHERE id_recurso = v_id_recurso AND dia_semana = v_dia_semana
      ) THEN
        UPDATE recurso_horario
        SET hora_apertura = TIME '08:00',
            hora_cierre = v_hora_cierre,
            activo = true,
            updated_at = now()
        WHERE id_recurso = v_id_recurso AND dia_semana = v_dia_semana;
      ELSE
        INSERT INTO recurso_horario (id_recurso, dia_semana, hora_apertura, hora_cierre, activo)
        VALUES (v_id_recurso, v_dia_semana, TIME '08:00', v_hora_cierre, true);
      END IF;
    END LOOP;
  END LOOP;
END $$;


-- ============================================================================
-- SECCIÓN 3: Función crear_reserva_recurso (atómica, con soporte nocturno)
-- ============================================================================
-- Cambios respecto de la versión anterior:
--   * hora_cierre/hora_fin ya no se comparan solo con "> apertura/inicio":
--     si hora_cierre <= hora_apertura (o hora_fin <= hora_inicio) se asume
--     que corresponde al día siguiente (+1440 minutos), igual que
--     lib/recursoDisponibilidad.ts (puntoRelativoA) en el código TypeScript.
--   * Los conflictos contra `reserva` y `recurso_bloqueo` ya no filtran solo
--     por fecha_reserva/fecha igual a la fecha pedida: se comparan intervalos
--     absolutos (fecha + hora) contemplando fecha-1 y fecha+1, para detectar
--     correctamente una reserva/bloqueo nocturno que ocupa minutos del día
--     siguiente.
--   * Se mantiene el pg_advisory_xact_lock por recurso para preservar la
--     atomicidad frente a reservas simultáneas, y el resto de las reglas
--     (duración válida, recurso activo/disponible, estado 'pendiente' con
--     expiración de pago a 5 minutos).

CREATE OR REPLACE FUNCTION public.crear_reserva_recurso(
  p_id_cliente INTEGER,
  p_id_recurso INTEGER,
  p_fecha_reserva DATE,
  p_hora_inicio TIME WITHOUT TIME ZONE,
  p_hora_fin TIME WITHOUT TIME ZONE,
  p_duracion_minutos INTEGER,
  p_costo_reserva NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_recurso_existe BOOLEAN;
    v_horario RECORD;
    v_dia_semana INT;
    v_apertura_min INT;
    v_cierre_min INT;
    v_inicio_min INT;
    v_fin_min INT;
    v_conflicto_reserva RECORD;
    v_conflicto_bloqueo RECORD;
    v_id_reserva INT;
    v_fecha_expiracion TIMESTAMPTZ;
BEGIN

    -- ============================================================
    -- 1. LOCK TRANSACCIONAL
    -- Serializa reservas del mismo recurso (ya NO solo de la misma
    -- fecha: una reserva nocturna ocupa minutos de fecha-1/fecha+1,
    -- así que dos transacciones concurrentes en fechas consecutivas
    -- del mismo recurso deben serializarse igual para no permitir un
    -- doble-booking en el borde de la medianoche).
    -- ============================================================
    PERFORM pg_advisory_xact_lock(
        hashtext(
            'reserva_recurso_' ||
            p_id_recurso::TEXT
        )
    );

    -- ============================================================
    -- 2. VALIDAR DURACIÓN
    -- ============================================================
    IF p_duracion_minutos NOT IN (90, 120) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'DURACION_INVALIDA',
            'message', 'La duración debe ser de 90 o 120 minutos.'
        );
    END IF;

    -- ============================================================
    -- 3. VALIDAR RECURSO
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
            'message', 'El recurso no existe, está inactivo o no está disponible.'
        );
    END IF;

    -- ============================================================
    -- 4. VALIDAR HORARIO
    --
    -- La versión anterior solo comparaba `hora_fin <= hora_inicio`,
    -- lo que rechazaba cualquier reserva nocturna real (23:00-01:00,
    -- 22:30-00:00) y nunca validaba contra la ventana de atención del
    -- recurso (recurso_horario). Ahora se busca el horario del día
    -- (EXTRACT(DOW ...) = 0 domingo .. 6 sábado, igual que
    -- JS Date.getDay()) y se ancla apertura/cierre e inicio/fin al
    -- mismo día operativo: si el cierre (o el fin de la reserva) es
    -- <= que su referencia, se asume que corresponde al día siguiente
    -- (p. ej. apertura 08:00, cierre "00:00"/"01:00"). Se permite
    -- terminar exactamente en el cierre, nunca después.
    -- ============================================================
    v_dia_semana := EXTRACT(DOW FROM p_fecha_reserva)::INT;

    SELECT hora_apertura, hora_cierre
    INTO v_horario
    FROM public.recurso_horario
    WHERE id_recurso = p_id_recurso
      AND dia_semana = v_dia_semana
      AND activo = TRUE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'HORARIO_INVALIDO',
            'message', 'El recurso no tiene horario configurado para ese día.'
        );
    END IF;

    v_apertura_min := EXTRACT(HOUR FROM v_horario.hora_apertura)::INT * 60
        + EXTRACT(MINUTE FROM v_horario.hora_apertura)::INT;

    v_cierre_min := EXTRACT(HOUR FROM v_horario.hora_cierre)::INT * 60
        + EXTRACT(MINUTE FROM v_horario.hora_cierre)::INT;

    IF v_cierre_min <= v_apertura_min THEN
        v_cierre_min := v_cierre_min + 24 * 60;
    END IF;

    v_inicio_min := EXTRACT(HOUR FROM p_hora_inicio)::INT * 60
        + EXTRACT(MINUTE FROM p_hora_inicio)::INT;

    v_fin_min := EXTRACT(HOUR FROM p_hora_fin)::INT * 60
        + EXTRACT(MINUTE FROM p_hora_fin)::INT;

    IF v_fin_min <= v_inicio_min THEN
        v_fin_min := v_fin_min + 24 * 60;
    END IF;

    IF v_inicio_min < v_apertura_min
       OR v_inicio_min >= v_cierre_min
       OR v_fin_min > v_cierre_min
       OR (v_fin_min - v_inicio_min) <> p_duracion_minutos
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'HORARIO_INVALIDO',
            'message', 'El horario solicitado está fuera del rango de atención del recurso para ese día.'
        );
    END IF;

    -- ============================================================
    -- 5. BUSCAR CONFLICTO CON RESERVAS
    --
    -- CONFIRMADA → siempre bloquea
    -- PENDIENTE + expiración futura → bloquea
    -- PENDIENTE + expiración NULL → bloquea (legacy)
    -- PENDIENTE vencida → no bloquea
    -- CANCELADA → no bloquea
    --
    -- A diferencia de la versión anterior (que solo miraba
    -- fecha_reserva = p_fecha_reserva), se buscan también fecha-1 y
    -- fecha+1, y el solapamiento se calcula con timestamps absolutos
    -- (fecha + hora, sumando 1 día a hora_fin si esa fila cruza la
    -- medianoche) para detectar correctamente una reserva nocturna
    -- que invade el día siguiente. Dos reservas consecutivas donde
    -- una termina justo cuando empieza la otra NO se consideran en
    -- conflicto (comparación estricta <).
    -- ============================================================
    SELECT
        id_reserva,
        fecha_reserva,
        hora_inicio,
        hora_fin,
        estado_reserva
    INTO v_conflicto_reserva
    FROM public.reserva
    WHERE id_recurso = p_id_recurso
      AND fecha_reserva BETWEEN p_fecha_reserva - 1 AND p_fecha_reserva + 1
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
          (p_fecha_reserva::timestamp + make_interval(mins => v_inicio_min))
            < (fecha_reserva::timestamp + make_interval(mins =>
                CASE WHEN hora_fin <= hora_inicio
                  THEN (EXTRACT(HOUR FROM hora_fin)::INT * 60 + EXTRACT(MINUTE FROM hora_fin)::INT) + 24 * 60
                  ELSE (EXTRACT(HOUR FROM hora_fin)::INT * 60 + EXTRACT(MINUTE FROM hora_fin)::INT)
                END))
          AND
          (p_fecha_reserva::timestamp + make_interval(mins => v_fin_min))
            > (fecha_reserva::timestamp + make_interval(mins =>
                (EXTRACT(HOUR FROM hora_inicio)::INT * 60 + EXTRACT(MINUTE FROM hora_inicio)::INT)))
      )
    ORDER BY fecha_reserva ASC, hora_inicio ASC
    LIMIT 1;

    IF v_conflicto_reserva.id_reserva IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CONFLICTO_RESERVA',
            'message', 'El recurso ya tiene una reserva en ese horario.',
            'detalle', jsonb_build_object(
                'id_reserva_conflicto',
                    v_conflicto_reserva.id_reserva,
                'fecha_reserva',
                    to_char(v_conflicto_reserva.fecha_reserva, 'YYYY-MM-DD'),
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
    --
    -- Mismo criterio de solapamiento absoluto que las reservas
    -- (fecha-1/fecha/fecha+1), ya que los bloqueos administrativos no
    -- están limitados al horario de atención y pueden fecharse al día
    -- siguiente de una reserva nocturna que termina a las 00:30/01:00.
    -- ============================================================
    SELECT
        id_bloqueo,
        fecha,
        hora_inicio,
        hora_fin,
        motivo
    INTO v_conflicto_bloqueo
    FROM public.recurso_bloqueo
    WHERE id_recurso = p_id_recurso
      AND activo = TRUE
      AND fecha BETWEEN p_fecha_reserva - 1 AND p_fecha_reserva + 1
      AND (
          (p_fecha_reserva::timestamp + make_interval(mins => v_inicio_min))
            < (fecha::timestamp + make_interval(mins =>
                CASE WHEN hora_fin <= hora_inicio
                  THEN (EXTRACT(HOUR FROM hora_fin)::INT * 60 + EXTRACT(MINUTE FROM hora_fin)::INT) + 24 * 60
                  ELSE (EXTRACT(HOUR FROM hora_fin)::INT * 60 + EXTRACT(MINUTE FROM hora_fin)::INT)
                END))
          AND
          (p_fecha_reserva::timestamp + make_interval(mins => v_fin_min))
            > (fecha::timestamp + make_interval(mins =>
                (EXTRACT(HOUR FROM hora_inicio)::INT * 60 + EXTRACT(MINUTE FROM hora_inicio)::INT)))
      )
    ORDER BY fecha ASC, hora_inicio ASC
    LIMIT 1;

    IF v_conflicto_bloqueo.id_bloqueo IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'CONFLICTO_BLOQUEO',
            'message', 'El recurso tiene un bloqueo activo en ese horario.',
            'detalle', jsonb_build_object(
                'id_bloqueo_conflicto',
                    v_conflicto_bloqueo.id_bloqueo,
                'fecha',
                    to_char(v_conflicto_bloqueo.fecha, 'YYYY-MM-DD'),
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
    -- La expiración se calcula directamente en PostgreSQL.
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
$function$;

