'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { horaAMinutos, calcularDuracionEnMinutos } from '@/lib/recursoDisponibilidad';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

import type {
  FiltrosReporte,
  ReporteCompleto,
  RecursoFiltroOpcion,
  DetalleCancelacionReporte
} from '@/types/reportes';

function obtenerFechaLocal(fecha: Date): string {
  return fecha.getFullYear() + '-' +
    String(fecha.getMonth() + 1).padStart(2, '0') + '-' +
    String(fecha.getDate()).padStart(2, '0');
}

const DIAS_SEMANA = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado'
];

/**
 * Recursos activos para poblar el selector de filtro
 * de la página de reportes.
 */
export async function obtenerRecursosParaFiltro(): Promise<
  RecursoFiltroOpcion[]
> {
  const permitido = await tienePermisoUsuario('reportes.ver');

  if (!permitido) {
    throw new Error(
      'No tenés permisos para ver los reportes.'
    );
  }

  try {
    const supabase = createServerComponentClient({ cookies });

    const { data, error } = await supabase
      .from('recurso')
      .select('id_recurso, nombre')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return data || [];
  } catch {
    return [];
  }
}

/**
 * Reporte completo del sistema de reservas.
 *
 * Requiere el permiso reportes.ver.
 */
export async function obtenerReporteCompleto(
  filtros: FiltrosReporte
): Promise<ReporteCompleto> {
  const permitido = await tienePermisoUsuario('reportes.ver');

  if (!permitido) {
    throw new Error(
      'No tenés permisos para ver los reportes.'
    );
  }

  const supabase = createServerComponentClient({ cookies });

  // 1. Reservas del rango, con los filtros de recurso/estado
  //    aplicados directamente en la consulta.
  let queryReservas = supabase
    .from('reserva')
    .select(
      'id_reserva, id_cliente, id_recurso, fecha_reserva, hora_inicio, hora_fin, duracion_minutos, estado_reserva, costo_reserva, fecha_expiracion_pago, created_at, id_voucher, id_descuento'
    )
    .gte('fecha_reserva', filtros.fechaDesde)
    .lte('fecha_reserva', filtros.fechaHasta);

  if (filtros.idRecurso) {
    queryReservas = queryReservas.eq(
      'id_recurso',
      filtros.idRecurso
    );
  }

  if (filtros.estadoReserva) {
    queryReservas = queryReservas.eq(
      'estado_reserva',
      filtros.estadoReserva
    );
  }

  const {
    data: reservasData,
    error: errorReservas
  } = await queryReservas;

  if (errorReservas) {
    throw new Error(
      `Error al obtener reservas para el reporte: ${errorReservas.message}`
    );
  }

  const idsCliente = Array.from(
    new Set(
      (reservasData || [])
        .map(r => r.id_cliente)
        .filter(
          (id): id is number =>
            typeof id === 'number'
        )
    )
  );

  // Los pagos se toman por la fecha en que se impactaron (fecha_pago, hora de
  // Buenos Aires), no por la fecha de la reserva. La ventana en la consulta es
  // amplia y el filtro exacto por día se hace abajo.
  const diaMs = 24 * 60 * 60 * 1000;
  const ventanaDesde = new Date(
    new Date(`${filtros.fechaDesde}T00:00:00Z`).getTime() - diaMs
  )
    .toISOString()
    .slice(0, 19);
  const ventanaHasta = new Date(
    new Date(`${filtros.fechaHasta}T00:00:00Z`).getTime() + 2 * diaMs
  )
    .toISOString()
    .slice(0, 19);

  // 2. Datos relacionados:
  //    clientes, recursos, pagos, horarios y bloqueos.
  const [
    { data: clientesData },
    { data: recursosData },
    { data: pagosRawData },
    { data: horariosData },
    { data: bloqueosData }
  ] = await Promise.all([
    idsCliente.length > 0
      ? supabase
          .from('cliente')
          .select(
            'id_cliente, nombre, apellido, tipo_cliente'
          )
          .in('id_cliente', idsCliente)
      : Promise.resolve({
          data: [] as {
            id_cliente: number;
            nombre: string;
            apellido: string;
            tipo_cliente: string | null;
          }[]
        }),

    supabase
      .from('recurso')
      .select(
        'id_recurso, nombre, tipo_recurso, estado, activo'
      ),

    supabase
      .from('pago')
      .select(
        'id_pago, id_reserva, monto, estado_pago, fecha_pago, mp_id'
      )
      .gte('fecha_pago', ventanaDesde)
      .lte('fecha_pago', ventanaHasta),

    supabase
      .from('recurso_horario')
      .select(
        'id_recurso, dia_semana, hora_apertura, hora_cierre'
      )
      .eq('activo', true),

    (() => {
      let q = supabase
        .from('recurso_bloqueo')
        .select(
          'id_bloqueo, id_recurso, fecha, fecha_fin, hora_inicio, hora_fin, motivo, activo'
        )
        .lte('fecha', filtros.fechaHasta)
        .gte('fecha_fin', filtros.fechaDesde);

      if (filtros.idRecurso) {
        q = q.eq(
          'id_recurso',
          filtros.idRecurso
        );
      }

      return q;
    })()
  ]);

  const clienteMap = new Map(
    (clientesData || []).map(c => [
      c.id_cliente,
      c
    ])
  );

  const recursoMap = new Map(
    (recursosData || []).map(r => [
      r.id_recurso,
      r
    ])
  );

  // 3. Filtro por tipo de cliente.
  const reservas = (reservasData || []).filter(r => {
    if (!filtros.tipoCliente) {
      return true;
    }

    return (
      clienteMap.get(r.id_cliente)
        ?.tipo_cliente === filtros.tipoCliente
    );
  });

  // Pagos impactados dentro del rango (día de Buenos Aires).
  const formatoDiaAR = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const pagosEnRango = (pagosRawData || []).filter(p => {
    if (!p.fecha_pago) {
      return false;
    }

    const fecha = new Date(p.fecha_pago);

    if (isNaN(fecha.getTime())) {
      return false;
    }

    const dia = formatoDiaAR.format(fecha);

    return (
      dia >= filtros.fechaDesde &&
      dia <= filtros.fechaHasta
    );
  });

  // Datos de las reservas de esos pagos (pueden ser de otras fechas de uso).
  const infoReservaPago = new Map<
    number,
    {
      id_cliente: number;
      id_recurso: number;
      estado_reserva: string;
      fecha_reserva: string;
      hora_inicio: string;
      hora_fin: string;
    }
  >();

  reservasData?.forEach(r =>
    infoReservaPago.set(r.id_reserva, r)
  );

  const idsReservaFaltantes = Array.from(
    new Set(
      pagosEnRango
        .map(p => p.id_reserva)
        .filter(id => !infoReservaPago.has(id))
    )
  );

  if (idsReservaFaltantes.length > 0) {
    const { data: extras } = await supabase
      .from('reserva')
      .select(
        'id_reserva, id_cliente, id_recurso, estado_reserva, fecha_reserva, hora_inicio, hora_fin'
      )
      .in('id_reserva', idsReservaFaltantes);

    extras?.forEach(r =>
      infoReservaPago.set(r.id_reserva, r)
    );

    const idsClienteFaltantes = Array.from(
      new Set(
        (extras || [])
          .map(r => r.id_cliente)
          .filter(id => !clienteMap.has(id))
      )
    );

    if (idsClienteFaltantes.length > 0) {
      const { data: clientesExtra } = await supabase
        .from('cliente')
        .select(
          'id_cliente, nombre, apellido, tipo_cliente'
        )
        .in('id_cliente', idsClienteFaltantes);

      clientesExtra?.forEach(c =>
        clienteMap.set(c.id_cliente, c)
      );
    }
  }

  const pagos = pagosEnRango.filter(p => {
    const info = infoReservaPago.get(p.id_reserva);

    if (!info) {
      return false;
    }

    if (
      filtros.idRecurso &&
      info.id_recurso !== filtros.idRecurso
    ) {
      return false;
    }

    if (
      filtros.estadoReserva &&
      info.estado_reserva !== filtros.estadoReserva
    ) {
      return false;
    }

    if (
      filtros.tipoCliente &&
      clienteMap.get(info.id_cliente)
        ?.tipo_cliente !== filtros.tipoCliente
    ) {
      return false;
    }

    return true;
  });

  const pagosAprobados = pagos.filter(
    p => p.estado_pago === 'aprobado'
  );

  const idReservaARecurso = new Map(
    pagos.map(p => [
      p.id_reserva,
      infoReservaPago.get(p.id_reserva)!.id_recurso
    ])
  );

  // ==========================================================================
  // 1. RESUMEN EJECUTIVO
  // ==========================================================================

  const ingresosTotales = pagosAprobados.reduce(
    (total, p) =>
      total + (p.monto || 0),
    0
  );

  const resumen = {
    totalReservas: reservas.length,
    reservasConfirmadas: reservas.filter(
      r => r.estado_reserva === 'confirmada'
    ).length,
    reservasPendientes: reservas.filter(
      r => r.estado_reserva === 'pendiente'
    ).length,
    reservasCanceladas: reservas.filter(
      r => r.estado_reserva === 'cancelada'
    ).length,
    ingresosTotales,
    clientesUnicos: new Set(
      reservas.map(r => r.id_cliente)
    ).size,
    recursosActivos: Array.from(
      recursoMap.values()
    ).filter(r => r.activo).length,
    ticketPromedio:
      reservas.length > 0
        ? ingresosTotales / reservas.length
        : 0
  };

  // ==========================================================================
  // 2. RESERVAS POR RECURSO
  // ==========================================================================

  const ingresosPorRecursoMap =
    new Map<number, number>();

  pagosAprobados.forEach(p => {
    const idRecurso =
      idReservaARecurso.get(p.id_reserva);

    if (idRecurso == null) {
      return;
    }

    ingresosPorRecursoMap.set(
      idRecurso,
      (ingresosPorRecursoMap.get(idRecurso) || 0) +
        (p.monto || 0)
    );
  });

  const idsRecursoConReservas = Array.from(
    new Set(
      reservas
        .map(r => r.id_recurso)
        .filter(
          (id): id is number =>
            typeof id === 'number'
        )
    )
  );

  const reservasPorRecurso =
    idsRecursoConReservas
      .map(idRecurso => {
        const reservasDelRecurso =
          reservas.filter(
            r => r.id_recurso === idRecurso
          );

        const recurso =
          recursoMap.get(idRecurso);

        return {
          id_recurso: idRecurso,
          nombre:
            recurso?.nombre ||
            `Recurso ${idRecurso}`,
          tipo_recurso:
            recurso?.tipo_recurso ||
            'N/A',
          totalReservas:
            reservasDelRecurso.length,
          reservasConfirmadas:
            reservasDelRecurso.filter(
              r =>
                r.estado_reserva ===
                'confirmada'
            ).length,
          reservasCanceladas:
            reservasDelRecurso.filter(
              r =>
                r.estado_reserva ===
                'cancelada'
            ).length,
          ingresos:
            ingresosPorRecursoMap.get(
              idRecurso
            ) || 0
        };
      })
      .sort(
        (a, b) =>
          b.totalReservas -
          a.totalReservas
      );

  // ==========================================================================
  // 3. DEMANDA Y HORARIOS
  // ==========================================================================

  const demandaHorarioMap: Record<
    string,
    number
  > = {};

  reservas.forEach(r => {
    if (!r.hora_inicio) {
      return;
    }

    const minutos = horaAMinutos(
      r.hora_inicio.substring(0, 5)
    );

    const minutosRedondeados =
      Math.floor(minutos / 30) * 30;

    const hh = Math.floor(
      minutosRedondeados / 60
    )
      .toString()
      .padStart(2, '0');

    const mm = (
      minutosRedondeados % 60
    )
      .toString()
      .padStart(2, '0');

    const slot = `${hh}:${mm}`;

    demandaHorarioMap[slot] =
      (demandaHorarioMap[slot] || 0) + 1;
  });

  const demandaPorHorario = Object.entries(
    demandaHorarioMap
  )
    .sort(([a], [b]) =>
      a.localeCompare(b)
    )
    .map(([hora, cantidad]) => ({
      hora,
      cantidad
    }));

  const demandaDiaSemanaConteo =
    Array(7).fill(0);

  reservas.forEach(r => {
    if (!r.fecha_reserva) {
      return;
    }

    const [
      year,
      month,
      day
    ] = r.fecha_reserva
      .split('-')
      .map(Number);

    const diaSemana = new Date(
      year,
      month - 1,
      day
    ).getDay();

    demandaDiaSemanaConteo[
      diaSemana
    ]++;
  });

  const demandaPorDiaSemana =
    DIAS_SEMANA.map(
      (dia, index) => ({
        dia,
        cantidad:
          demandaDiaSemanaConteo[
            index
          ]
      })
    );

  // ==========================================================================
  // 4. CLIENTES
  // ==========================================================================

  const gastoPorClienteMap =
    new Map<number, number>();

  pagosAprobados.forEach(p => {
    const idCliente = infoReservaPago.get(
      p.id_reserva
    )?.id_cliente;

    if (idCliente == null) {
      return;
    }

    gastoPorClienteMap.set(
      idCliente,
      (gastoPorClienteMap.get(idCliente) || 0) +
        (p.monto || 0)
    );
  });

  const clientes = idsCliente
    .map(idCliente => {
      const cliente =
        clienteMap.get(idCliente);

      const reservasDelCliente =
        reservas.filter(
          r =>
            r.id_cliente ===
            idCliente
        );

      return {
        id_cliente: idCliente,
        nombre:
          cliente?.nombre ||
          'Desconocido',
        apellido:
          cliente?.apellido || '',
        tipo_cliente:
          cliente?.tipo_cliente ||
          'NO_SOCIO',
        totalReservas:
          reservasDelCliente.length,
        totalGastado:
          gastoPorClienteMap.get(
            idCliente
          ) || 0
      };
    })
    .filter(
      c => c.totalReservas > 0
    )
    .sort(
      (a, b) =>
        b.totalReservas -
        a.totalReservas
    );

  // ==========================================================================
  // 5. INGRESOS
  // ==========================================================================

  const ingresosPorEstadoPagoMap =
    new Map<
      string,
      {
        cantidad: number;
        monto: number;
      }
    >();

  pagos.forEach(p => {
    const actual =
      ingresosPorEstadoPagoMap.get(
        p.estado_pago
      ) || {
        cantidad: 0,
        monto: 0
      };

    actual.cantidad += 1;
    actual.monto += p.monto || 0;

    ingresosPorEstadoPagoMap.set(
      p.estado_pago,
      actual
    );
  });

  const ingresosPorEstadoPago =
    Array.from(
      ingresosPorEstadoPagoMap.entries()
    ).map(
      ([estado_pago, valores]) => ({
        estado_pago,
        ...valores
      })
    );

  const detallePagosAprobados = pagosAprobados
    .map(p => {
      const info = infoReservaPago.get(p.id_reserva)!;
      const cliente = clienteMap.get(info.id_cliente);

      return {
        id_pago: p.id_pago,
        mp_id: p.mp_id || null,
        id_reserva: p.id_reserva,
        fecha_pago: formatoDiaAR.format(
          new Date(p.fecha_pago)
        ),
        fecha_reserva: info.fecha_reserva,
        hora_inicio: (info.hora_inicio || '').substring(0, 5),
        hora_fin: (info.hora_fin || '').substring(0, 5),
        recurso_nombre:
          recursoMap.get(info.id_recurso)?.nombre ||
          `Recurso ${info.id_recurso}`,
        cliente_nombre: cliente
          ? `${cliente.nombre} ${cliente.apellido}`.trim()
          : '-',
        estado_reserva: info.estado_reserva,
        monto: p.monto || 0
      };
    })
    .sort((a, b) => a.id_pago - b.id_pago);

  const ingresosPorRecurso =
    Array.from(
      new Set([
        ...idsRecursoConReservas,
        ...ingresosPorRecursoMap.keys()
      ])
    )
      .map(idRecurso => ({
        id_recurso: idRecurso,
        nombre:
          recursoMap.get(
            idRecurso
          )?.nombre ||
          `Recurso ${idRecurso}`,
        ingresos:
          ingresosPorRecursoMap.get(
            idRecurso
          ) || 0
      }))
      .sort(
        (a, b) =>
          b.ingresos -
          a.ingresos
      );

  // ==========================================================================
  // 6. CANCELACIONES Y VENCIMIENTOS
  // ==========================================================================

  const ahora = new Date();

  const canceladas = reservas.filter(
    r =>
      r.estado_reserva ===
      'cancelada'
  );

  const pendientesVencidas =
    reservas.filter(
      r =>
        r.estado_reserva ===
          'pendiente' &&
        !!r.fecha_expiracion_pago &&
        new Date(
          r.fecha_expiracion_pago
        ) <= ahora
    );

  const detalleCancelaciones:
    DetalleCancelacionReporte[] = [
      ...canceladas.map(r => ({
        id_reserva: r.id_reserva,
        fecha_reserva:
          r.fecha_reserva,
        motivo: 'Cancelada'
      })),

      ...pendientesVencidas.map(r => ({
        id_reserva: r.id_reserva,
        fecha_reserva:
          r.fecha_reserva,
        motivo:
          'Pendiente vencida sin pago'
      }))
    ].sort((a, b) =>
      a.fecha_reserva.localeCompare(
        b.fecha_reserva
      )
    );

  const cancelaciones = {
    totalCanceladas:
      canceladas.length,
    totalPendientesVencidas:
      pendientesVencidas.length,
    detalle:
      detalleCancelaciones
  };

  // ==========================================================================
  // 7. BLOQUEOS Y MANTENIMIENTO
  // ==========================================================================

  const bloqueos =
    (bloqueosData || [])
      .map(b => ({
        id_bloqueo:
          b.id_bloqueo,
        id_recurso:
          b.id_recurso,
        nombre_recurso:
          recursoMap.get(
            b.id_recurso
          )?.nombre ||
          `Recurso ${b.id_recurso}`,
        fecha: b.fecha,
        fecha_fin: b.fecha_fin,
        hora_inicio:
          b.hora_inicio,
        hora_fin:
          b.hora_fin,
        motivo: b.motivo,
        activo: b.activo
      }))
      .sort((a, b) =>
        a.fecha.localeCompare(
          b.fecha
        )
      );

  // ==========================================================================
  // 8. OCUPACIÓN
  // ==========================================================================

  const fechasDelRango: string[] = [];

  const [
    yD,
    mD,
    dD
  ] = filtros.fechaDesde
    .split('-')
    .map(Number);

  const [
    yH,
    mH,
    dH
  ] = filtros.fechaHasta
    .split('-')
    .map(Number);

  const cursor = new Date(
    yD,
    mD - 1,
    dD
  );

  const limite = new Date(
    yH,
    mH - 1,
    dH
  );

  while (cursor <= limite) {
    fechasDelRango.push(
      obtenerFechaLocal(cursor)
    );

    cursor.setDate(
      cursor.getDate() + 1
    );
  }

  const recursosParaOcupacion =
    filtros.idRecurso
      ? Array.from(
          recursoMap.values()
        ).filter(
          r =>
            r.id_recurso ===
            filtros.idRecurso
        )
      : Array.from(
          recursoMap.values()
        ).filter(
          r => r.activo
        );

  const ocupacion =
    recursosParaOcupacion
      .map(recurso => {
        const horariosRecurso =
          (horariosData || []).filter(
            h =>
              h.id_recurso ===
              recurso.id_recurso
          );

        let minutosDisponibles = 0;

        fechasDelRango.forEach(
          fecha => {
            const [
              y,
              m,
              d
            ] = fecha
              .split('-')
              .map(Number);

            const diaSemana =
              new Date(
                y,
                m - 1,
                d
              ).getDay();

            const horario =
              horariosRecurso.find(
                h =>
                  h.dia_semana ===
                  diaSemana
              );

            if (horario) {
              minutosDisponibles +=
                Math.max(
                  0,
                  calcularDuracionEnMinutos(
                    horario.hora_apertura,
                    horario.hora_cierre
                  )
                );
            }
          }
        );

        const minutosReservados =
          reservas
            .filter(
              r =>
                r.id_recurso ===
                  recurso.id_recurso &&
                r.estado_reserva !==
                  'cancelada'
            )
            .reduce(
              (total, r) => {
                if (
                  r.duracion_minutos
                ) {
                  return (
                    total +
                    r.duracion_minutos
                  );
                }

                if (
                  r.hora_inicio &&
                  r.hora_fin
                ) {
                  return (
                    total +
                    Math.max(
                      0,
                      calcularDuracionEnMinutos(
                        r.hora_inicio,
                        r.hora_fin
                      )
                    )
                  );
                }

                return total;
              },
              0
            );

        return {
          id_recurso:
            recurso.id_recurso,
          nombre:
            recurso.nombre,
          minutosDisponibles,
          minutosReservados,
          porcentajeOcupacion:
            minutosDisponibles >
            0
              ? Math.round(
                  (minutosReservados /
                    minutosDisponibles) *
                    10000
                ) / 100
              : 0
        };
      })
      .sort(
        (a, b) =>
          b.porcentajeOcupacion -
          a.porcentajeOcupacion
      );

  // ==========================================================================
  // 9. DETALLE DE RESERVAS
  // ==========================================================================

  const detalleReservas =
    reservas
      .map(r => {
        const cliente =
          clienteMap.get(
            r.id_cliente
          );

        const recurso =
          recursoMap.get(
            r.id_recurso
          );

        return {
          id_reserva:
            r.id_reserva,
          fecha_reserva:
            r.fecha_reserva,
          hora_inicio:
            r.hora_inicio,
          hora_fin:
            r.hora_fin,
          duracion_minutos:
            r.duracion_minutos,
          estado_reserva:
            r.estado_reserva,
          costo_reserva:
            r.costo_reserva,
          con_beneficio:
            r.id_voucher != null ||
            r.id_descuento != null,
          cliente_nombre:
            cliente
              ? `${cliente.nombre} ${
                  cliente.apellido ||
                  ''
                }`.trim()
              : 'Desconocido',
          cliente_tipo:
            cliente?.tipo_cliente ||
            'NO_SOCIO',
          recurso_nombre:
            recurso?.nombre ||
            `Recurso ${r.id_recurso}`
        };
      })
      .sort((a, b) =>
        (
          a.fecha_reserva +
          a.hora_inicio
        ).localeCompare(
          b.fecha_reserva +
            b.hora_inicio
        )
      );

  return {
    filtros,
    resumen,
    reservasPorRecurso,
    demandaPorHorario,
    demandaPorDiaSemana,
    clientes,
    ingresosPorEstadoPago,
    ingresosPorRecurso,
    detallePagosAprobados,
    cancelaciones,
    bloqueos,
    ocupacion,
    detalleReservas
  };
}