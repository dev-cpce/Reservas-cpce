import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ApiResponse } from '@/types/api';

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseKey);
}

function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === process.env.N8N_API_KEY;
}

type Reserva = {
  id_reserva: number;
  hora_inicio: string;
  hora_fin: string;
  estado_reserva: string;
  fecha_expiracion_pago: string | null;
};

type HorarioOcupado = {
  hora_inicio: string;
  hora_fin: string;
  tipo: 'reserva' | 'bloqueo';
  motivo?: string | null;
};

type DisponibilidadRecursoResponse = {
  id_recurso: number;
  nombre: string;
  tipo_recurso: string;
  deporte: string | null;
  capacidad: number | null;
  estado: string;
  disponible: boolean;

  // Horarios donde se puede reservar 120 minutos
  horariosDisponibles: string[];

  // Horarios donde SOLO se puede reservar 90 minutos
  horariosSolo90: string[];

  horariosOcupados: HorarioOcupado[];
};

function normalizarHora(hora: string): string {
  return hora.slice(0, 5);
}

function minutosDesdeMedianoche(hora: string): number {
  const [horas, minutos] = normalizarHora(hora)
    .split(':')
    .map(Number);

  return horas * 60 + minutos;
}

function horaDesdeMinutos(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;

  return `${horas.toString().padStart(2, '0')}:${minutosRestantes
    .toString()
    .padStart(2, '0')}`;
}

function calcularHoraFin(
  horaInicio: string,
  duracionMinutos: number
): string {
  const inicio = minutosDesdeMedianoche(horaInicio);

  return horaDesdeMinutos(
    inicio + duracionMinutos
  );
}

function haySolapamiento(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string
): boolean {
  const inicioAMin =
    minutosDesdeMedianoche(inicioA);

  const finAMin =
    minutosDesdeMedianoche(finA);

  const inicioBMin =
    minutosDesdeMedianoche(inicioB);

  const finBMin =
    minutosDesdeMedianoche(finB);

  return (
    inicioAMin < finBMin &&
    finAMin > inicioBMin
  );
}

function obtenerDiaSemana(fecha: string): number {
  const [year, month, day] =
    fecha.split('-').map(Number);

  return new Date(
    Date.UTC(year, month - 1, day)
  ).getUTCDay();
}

function obtenerFechaHoraArgentina(): {
  fecha: string;
  hora: string;
} {
  const ahora = new Date();

  const partes =
    new Intl.DateTimeFormat('en-CA', {
      timeZone:
        'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(ahora);

  const valores = Object.fromEntries(
    partes
      .filter(
        (parte) =>
          parte.type !== 'literal'
      )
      .map((parte) => [
        parte.type,
        parte.value,
      ])
  );

  return {
    fecha:
      `${valores.year}-${valores.month}-${valores.day}`,

    hora:
      `${valores.hour}:${valores.minute}`,
  };
}

function validarDuracion(
  duracionMinutos: number
): boolean {
  return (
    duracionMinutos === 90 ||
    duracionMinutos === 120
  );
}

function reservaBloqueaRecurso(
  reserva: Reserva,
  ahora: Date
): boolean {

  if (
    reserva.estado_reserva ===
    'confirmada'
  ) {
    return true;
  }

  if (
    reserva.estado_reserva !==
    'pendiente'
  ) {
    return false;
  }

  /*
   * Las reservas pendientes sin expiración
   * se consideran bloqueantes por compatibilidad.
   */
  if (
    !reserva.fecha_expiracion_pago
  ) {
    return true;
  }

  return (
    new Date(
      reserva.fecha_expiracion_pago
    ) > ahora
  );
}

async function obtenerDisponibilidadRecursos(
  fecha: string,
  idRecurso?: number,
  horaInicio?: string,
  duracionMinutos?: number
): Promise<
  DisponibilidadRecursoResponse[]
> {

  /*
   * Si se solicita una duración concreta,
   * solamente puede ser 90 o 120.
   */

  if (
    duracionMinutos !== undefined &&
    !validarDuracion(
      duracionMinutos
    )
  ) {
    throw new Error(
      'La duración debe ser de 90 o 120 minutos.'
    );
  }

  const supabase =
    getSupabaseClient();

  /*
   * ==========================================================
   * RECURSOS
   * ==========================================================
   */

  const {
    data: recursos,
    error: recursosError,
  } = await supabase
    .from('recurso')
    .select(
      'id_recurso, nombre, tipo_recurso, deporte, capacidad, estado, activo'
    )
    .eq('activo', true)
    .eq('estado', 'DISPONIBLE')
    .order(
      'id_recurso',
      {
        ascending: true,
      }
    );

  if (recursosError) {
    console.error(
      'Error al consultar recursos:',
      recursosError
    );

    throw new Error(
      'Error al consultar recursos'
    );
  }

  if (
    !recursos ||
    recursos.length === 0
  ) {
    return [];
  }

  const recursosFiltrados =
    idRecurso
      ? recursos.filter(
          (recurso) =>
            recurso.id_recurso ===
            idRecurso
        )
      : recursos;

  if (
    recursosFiltrados.length === 0
  ) {
    return [];
  }

  /*
   * ==========================================================
   * FECHA
   * ==========================================================
   */

  const diaSemana =
    obtenerDiaSemana(fecha);

  const ahora = new Date();

  const {
    fecha: fechaActualArgentina,
    hora: horaActualArgentina,
  } =
    obtenerFechaHoraArgentina();

  const esHoy =
    fecha ===
    fechaActualArgentina;

  const resultados: DisponibilidadRecursoResponse[] =
    [];

  /*
   * ==========================================================
   * PROCESAR CADA RECURSO
   * ==========================================================
   */

  for (
    const recurso of recursosFiltrados
  ) {

    /*
     * --------------------------------------------------------
     * HORARIOS DEL RECURSO
     * --------------------------------------------------------
     */

    const {
      data: horarios,
      error: horariosError,
    } = await supabase
      .from('recurso_horario')
      .select(
        'id_horario, id_recurso, dia_semana, hora_apertura, hora_cierre, activo'
      )
      .eq(
        'id_recurso',
        recurso.id_recurso
      )
      .eq(
        'dia_semana',
        diaSemana
      )
      .eq(
        'activo',
        true
      )
      .order(
        'hora_apertura',
        {
          ascending: true,
        }
      );

    if (horariosError) {
      console.error(
        `Error al consultar horario del recurso ${recurso.id_recurso}:`,
        horariosError
      );

      throw new Error(
        `Error al consultar el horario del recurso ${recurso.id_recurso}`
      );
    }

    if (
      !horarios ||
      horarios.length === 0
    ) {
      continue;
    }

    /*
     * --------------------------------------------------------
     * RESERVAS
     * --------------------------------------------------------
     */

    const {
      data: reservas,
      error: reservasError,
    } = await supabase
      .from('reserva')
      .select(
        'id_reserva, hora_inicio, hora_fin, estado_reserva, fecha_expiracion_pago'
      )
      .eq(
        'id_recurso',
        recurso.id_recurso
      )
      .eq(
        'fecha_reserva',
        fecha
      )
      .neq(
        'estado_reserva',
        'cancelada'
      );

    if (reservasError) {
      console.error(
        `Error al consultar reservas del recurso ${recurso.id_recurso}:`,
        reservasError
      );

      throw new Error(
        `Error al consultar reservas del recurso ${recurso.id_recurso}`
      );
    }

    const reservasActivas =
      (reservas || []).filter(
        (reserva) =>
          reservaBloqueaRecurso(
            reserva,
            ahora
          )
      );

    /*
     * --------------------------------------------------------
     * BLOQUEOS
     * --------------------------------------------------------
     */

    const {
      data: bloqueos,
      error: bloqueosError,
    } = await supabase
      .from('recurso_bloqueo')
      .select(
        'id_bloqueo, hora_inicio, hora_fin, motivo'
      )
      .eq(
        'id_recurso',
        recurso.id_recurso
      )
      .eq(
        'fecha',
        fecha
      )
      .eq(
        'activo',
        true
      )
      .order(
        'hora_inicio',
        {
          ascending: true,
        }
      );

    if (bloqueosError) {
      console.error(
        `Error al consultar bloqueos del recurso ${recurso.id_recurso}:`,
        bloqueosError
      );

      throw new Error(
        `Error al consultar bloqueos del recurso ${recurso.id_recurso}`
      );
    }

    /*
     * --------------------------------------------------------
     * UNIFICAR OCUPACIONES
     * --------------------------------------------------------
     */

    const horariosOcupados:
      HorarioOcupado[] = [
        ...reservasActivas.map(
          (reserva) => ({
            hora_inicio:
              normalizarHora(
                reserva.hora_inicio
              ),

            hora_fin:
              normalizarHora(
                reserva.hora_fin
              ),

            tipo:
              'reserva' as const,
          })
        ),

        ...(bloqueos || []).map(
          (bloqueo) => ({
            hora_inicio:
              normalizarHora(
                bloqueo.hora_inicio
              ),

            hora_fin:
              normalizarHora(
                bloqueo.hora_fin
              ),

            tipo:
              'bloqueo' as const,

            motivo:
              bloqueo.motivo,
          })
        ),
      ];

    /*
     * ==========================================================
     * DISPONIBILIDAD
     * ==========================================================
     *
     * Cuando NO se especifica duración:
     *
     * horariosDisponibles:
     *   horarios donde entran 120 minutos.
     *
     * horariosSolo90:
     *   horarios donde NO entran 120 minutos
     *   pero sí entran 90 minutos.
     *
     * Esto evita duplicar horarios.
     */

    const horariosDisponibles:
      string[] = [];

    const horariosSolo90:
      string[] = [];

    for (
      const horario of horarios
    ) {

      const apertura =
        minutosDesdeMedianoche(
          horario.hora_apertura
        );

      const cierre =
        minutosDesdeMedianoche(
          horario.hora_cierre
        );

      /*
       * Recorremos siempre cada 30 minutos.
       *
       * Si se pide una duración concreta,
       * usamos solamente esa duración.
       */

      for (
        let inicio = apertura;
        inicio + 90 <= cierre;
        inicio += 30
      ) {

        const horaSlot =
          horaDesdeMinutos(
            inicio
          );

        /*
         * Si es hoy, no mostrar horarios
         * que ya comenzaron.
         */

        if (
          esHoy &&
          minutosDesdeMedianoche(
            horaSlot
          ) <=
            minutosDesdeMedianoche(
              horaActualArgentina
            )
        ) {
          continue;
        }

        /*
         * ======================================================
         * COMPROBAR 120 MINUTOS
         * ======================================================
         */

        const puede120 =
          inicio + 120 <= cierre &&
          !horariosOcupados.some(
            (ocupado) =>
              haySolapamiento(
                horaSlot,
                calcularHoraFin(
                  horaSlot,
                  120
                ),
                ocupado.hora_inicio,
                ocupado.hora_fin
              )
          );

        /*
         * ======================================================
         * COMPROBAR 90 MINUTOS
         * ======================================================
         */

        const puede90 =
          !horariosOcupados.some(
            (ocupado) =>
              haySolapamiento(
                horaSlot,
                calcularHoraFin(
                  horaSlot,
                  90
                ),
                ocupado.hora_inicio,
                ocupado.hora_fin
              )
          );

        /*
         * ======================================================
         * SI SE SOLICITÓ UNA DURACIÓN CONCRETA
         * ======================================================
         */

        if (
          duracionMinutos ===
          120
        ) {

          if (puede120) {
            horariosDisponibles.push(
              horaSlot
            );
          }

          continue;
        }

        if (
          duracionMinutos ===
          90
        ) {

          if (puede90) {
            horariosDisponibles.push(
              horaSlot
            );
          }

          continue;
        }

        /*
         * ======================================================
         * SIN DURACIÓN ESPECIFICADA
         * ======================================================
         *
         * Primero priorizamos 120.
         */

        if (puede120) {

          horariosDisponibles.push(
            horaSlot
          );

          continue;
        }

        /*
         * Solo llega acá si:
         *
         * 120 NO se puede reservar
         * pero 90 SÍ.
         */

        if (
          !puede120 &&
          puede90
        ) {

          horariosSolo90.push(
            horaSlot
          );
        }
      }
    }

    /*
     * ==========================================================
     * ELIMINAR DUPLICADOS
     * ==========================================================
     */

    const horariosDisponiblesUnicos =
      [
        ...new Set(
          horariosDisponibles
        ),
      ].sort();

    const horariosSolo90Unicos =
      [
        ...new Set(
          horariosSolo90
        ),
      ].sort();

    /*
     * ==========================================================
     * SI SE SOLICITÓ UNA HORA CONCRETA
     * ==========================================================
     */

    if (horaInicio) {

      const horaSolicitada =
        normalizarHora(
          horaInicio
        );

      /*
       * Determinamos si la hora está
       * disponible para la duración solicitada.
       */

      let disponible = false;

      if (
        duracionMinutos ===
        120
      ) {
        disponible =
          horariosDisponiblesUnicos.includes(
            horaSolicitada
          );
      } else {
        disponible =
          horariosDisponiblesUnicos.includes(
            horaSolicitada
          ) ||
          horariosSolo90Unicos.includes(
            horaSolicitada
          );
      }

      if (!disponible) {
        continue;
      }

      resultados.push({
        id_recurso:
          recurso.id_recurso,

        nombre:
          recurso.nombre,

        tipo_recurso:
          recurso.tipo_recurso,

        deporte:
          recurso.deporte,

        capacidad:
          recurso.capacidad,

        estado:
          recurso.estado,

        disponible: true,

        horariosDisponibles:
          horariosDisponiblesUnicos.includes(
            horaSolicitada
          )
            ? [horaSolicitada]
            : [],

        horariosSolo90:
          horariosSolo90Unicos.includes(
            horaSolicitada
          )
            ? [horaSolicitada]
            : [],

        horariosOcupados,
      });

      continue;
    }

    /*
     * ==========================================================
     * RESULTADO NORMAL
     * ==========================================================
     */

    resultados.push({
      id_recurso:
        recurso.id_recurso,

      nombre:
        recurso.nombre,

      tipo_recurso:
        recurso.tipo_recurso,

      deporte:
        recurso.deporte,

      capacidad:
        recurso.capacidad,

      estado:
        recurso.estado,

      disponible:
        horariosDisponiblesUnicos.length >
          0 ||
        horariosSolo90Unicos.length >
          0,

      horariosDisponibles:
        horariosDisponiblesUnicos,

      horariosSolo90:
        horariosSolo90Unicos,

      horariosOcupados,
    });
  }

  return resultados;
}

/*
 * ================================================================
 * GET
 * ================================================================
 */

export async function GET(
  request: NextRequest
) {
  try {

    if (
      !validateApiKey(
        request
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'API Key no válida',
        },
        {
          status: 401,
        }
      );
    }

    const {
      searchParams,
    } = new URL(
      request.url
    );

    const fecha =
      searchParams.get(
        'fecha'
      ) ||
      obtenerFechaHoraArgentina()
        .fecha;

    const idRecursoParam =
      searchParams.get(
        'id_recurso'
      );

    const horaInicio =
      searchParams.get(
        'hora_inicio'
      ) || undefined;

    /*
     * IMPORTANTE:
     *
     * Si NO se envía duración,
     * ahora devolvemos simultáneamente:
     *
     * - horariosDisponibles = 120 min
     * - horariosSolo90 = 90 min
     *
     * Por eso ya NO usamos 90 como
     * duración por defecto.
     */

    const duracionParam =
      searchParams.get(
        'duracion_minutos'
      );

    const duracionMinutos =
      duracionParam
        ? Number(
            duracionParam
          )
        : undefined;

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        fecha
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'La fecha debe tener formato YYYY-MM-DD',
        },
        {
          status: 400,
        }
      );
    }

    if (
      duracionMinutos !==
        undefined &&
      !validarDuracion(
        duracionMinutos
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'La duración debe ser de 90 o 120 minutos.',
        },
        {
          status: 400,
        }
      );
    }

    let idRecurso:
      | number
      | undefined;

    if (idRecursoParam) {

      idRecurso =
        Number(
          idRecursoParam
        );

      if (
        !Number.isInteger(
          idRecurso
        ) ||
        idRecurso <= 0
      ) {
        return NextResponse.json<ApiResponse>(
          {
            success: false,
            error:
              'id_recurso no válido',
          },
          {
            status: 400,
          }
        );
      }
    }

    const disponibilidad =
      await obtenerDisponibilidadRecursos(
        fecha,
        idRecurso,
        horaInicio,
        duracionMinutos
      );

    return NextResponse.json<
      ApiResponse<
        DisponibilidadRecursoResponse[]
      >
    >({
      success: true,

      data:
        disponibilidad,

      message:
        duracionMinutos
          ? `Disponibilidad para el ${fecha} durante ${duracionMinutos} minutos`
          : `Disponibilidad para el ${fecha}: horarios de 120 minutos y horarios disponibles solo por 90 minutos`,
    });

  } catch (error) {

    console.error(
      'Error en GET /external/disponibilidad:',
      error
    );

    return NextResponse.json<ApiResponse>(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor',
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * ================================================================
 * POST
 * ================================================================
 */

export async function POST(
  request: NextRequest
) {
  try {

    if (
      !validateApiKey(
        request
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'API Key no válida',
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const fecha =
      body.fecha ||
      obtenerFechaHoraArgentina()
        .fecha;

    const idRecurso =
      body.id_recurso !==
        undefined &&
      body.id_recurso !==
        null
        ? Number(
            body.id_recurso
          )
        : undefined;

    const horaInicio =
      body.hora_inicio ||
      undefined;

    /*
     * Si el POST incluye duración,
     * funciona normalmente.
     *
     * Si no incluye duración,
     * devuelve las dos categorías.
     */

    const duracionMinutos =
      body.duracion_minutos !==
        undefined &&
      body.duracion_minutos !==
        null
        ? Number(
            body.duracion_minutos
          )
        : undefined;

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        fecha
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'La fecha debe tener formato YYYY-MM-DD',
        },
        {
          status: 400,
        }
      );
    }

    if (
      idRecurso !==
        undefined &&
      (
        !Number.isInteger(
          idRecurso
        ) ||
        idRecurso <= 0
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'id_recurso no válido',
        },
        {
          status: 400,
        }
      );
    }

    if (
      duracionMinutos !==
        undefined &&
      !validarDuracion(
        duracionMinutos
      )
    ) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          error:
            'La duración debe ser de 90 o 120 minutos.',
        },
        {
          status: 400,
        }
      );
    }

    const disponibilidad =
      await obtenerDisponibilidadRecursos(
        fecha,
        idRecurso,
        horaInicio,
        duracionMinutos
      );

    return NextResponse.json<
      ApiResponse<
        DisponibilidadRecursoResponse[]
      >
    >({
      success: true,

      data:
        disponibilidad,

      message:
        duracionMinutos
          ? `Disponibilidad para el ${fecha} durante ${duracionMinutos} minutos`
          : `Disponibilidad para el ${fecha}: horarios de 120 minutos y horarios disponibles solo por 90 minutos`,
    });

  } catch (error) {

    console.error(
      'Error en POST /external/disponibilidad:',
      error
    );

    return NextResponse.json<ApiResponse>(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Error interno del servidor',
      },
      {
        status: 500,
      }
    );
  }
}