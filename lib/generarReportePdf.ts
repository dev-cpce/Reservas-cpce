import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ReporteCompleto } from '@/types/reportes';

export type SeccionReportePDF =
  | 'resumen'
  | 'recursos'
  | 'demanda'
  | 'clientes'
  | 'ingresos'
  | 'cancelaciones'
  | 'bloqueos'
  | 'ocupacion'
  | 'detalle';

type AutoTableState = {
  finalY?: number;
};

type JsPDFConAutoTable = jsPDF & {
  lastAutoTable?: AutoTableState;
};

const COLOR_PRINCIPAL: [number, number, number] = [30, 64, 175];
const COLOR_SECUNDARIO: [number, number, number] = [71, 85, 105];
const COLOR_TEXTO: [number, number, number] = [15, 23, 42];
const COLOR_GRIS_CLARO: [number, number, number] = [241, 245, 249];

function obtenerDocConAutoTable(doc: jsPDF): JsPDFConAutoTable {
  return doc as JsPDFConAutoTable;
}

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(valor || 0);
}

function formatearFecha(fecha: string): string {
  if (!fecha) return '-';

  const partes = fecha.split('-');

  if (partes.length !== 3) return fecha;

  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function formatearHora(hora: string | null | undefined): string {
  if (!hora) return '-';

  return hora.substring(0, 5);
}

/**
 * Devuelve la posición vertical donde debe comenzar
 * el siguiente contenido.
 */
function obtenerPosicionY(doc: jsPDF): number {
  const autoTableState = obtenerDocConAutoTable(doc);

  if (
    autoTableState.lastAutoTable &&
    typeof autoTableState.lastAutoTable.finalY === 'number'
  ) {
    return autoTableState.lastAutoTable.finalY + 8;
  }

  return 52;
}

/**
 * Establece manualmente la posición vertical cuando
 * necesitamos posicionar contenido que todavía no es una tabla.
 */
function establecerPosicionY(doc: jsPDF, y: number) {
  obtenerDocConAutoTable(doc).lastAutoTable = {
    finalY: y,
  };
}

/**
 * Limpia la referencia de la última tabla después
 * de comenzar una página nueva.
 */
function limpiarPosicionY(doc: jsPDF) {
  obtenerDocConAutoTable(doc).lastAutoTable = undefined;
}

/**
 * Agrega encabezado y pie de página a todas las páginas.
 */
function agregarPieDePagina(doc: jsPDF) {
  const totalPaginas = doc.getNumberOfPages();

  for (let pagina = 1; pagina <= totalPaginas; pagina++) {
    doc.setPage(pagina);

    const ancho = doc.internal.pageSize.getWidth();
    const alto = doc.internal.pageSize.getHeight();

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);

    doc.line(
      15,
      alto - 15,
      ancho - 15,
      alto - 15
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLOR_SECUNDARIO);

    doc.text(
      'Sistema de Reservas',
      15,
      alto - 9
    );

    doc.text(
      `Página ${pagina} de ${totalPaginas}`,
      ancho - 15,
      alto - 9,
      {
        align: 'right',
      }
    );
  }
}

/**
 * Agrega el título principal de una sección.
 *
 * No fuerza una página nueva salvo que realmente
 * no haya espacio suficiente para el título.
 */
function agregarTituloSeccion(
  doc: jsPDF,
  numero: string,
  titulo: string
) {
  const alto = doc.internal.pageSize.getHeight();
  const margenInferior = 25;

  let posicion = obtenerPosicionY(doc);

  if (posicion + 18 > alto - margenInferior) {
    doc.addPage();

    limpiarPosicionY(doc);

    posicion = 20;
  }

  // Barra vertical azul
  doc.setFillColor(...COLOR_PRINCIPAL);

  doc.rect(
    15,
    posicion,
    3,
    9,
    'F'
  );

  // Título
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR_PRINCIPAL);

  doc.text(
    `${numero}. ${titulo}`,
    23,
    posicion + 6.5
  );

  // Línea inferior
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);

  doc.line(
    23,
    posicion + 10,
    195,
    posicion + 10
  );

  doc.setTextColor(...COLOR_TEXTO);
  doc.setFont('helvetica', 'normal');

  // Indicamos dónde debe comenzar el próximo contenido.
  establecerPosicionY(
    doc,
    posicion + 10
  );
}

/**
 * Agrega un subtítulo interno dentro de una sección.
 */
function agregarSubtitulo(
  doc: jsPDF,
  texto: string
) {
  const alto = doc.internal.pageSize.getHeight();
  const margenInferior = 25;

  let posicion = obtenerPosicionY(doc);

  if (posicion + 12 > alto - margenInferior) {
    doc.addPage();

    limpiarPosicionY(doc);

    posicion = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...COLOR_SECUNDARIO);

  doc.text(
    texto,
    15,
    posicion + 5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR_TEXTO);

  establecerPosicionY(
    doc,
    posicion + 8
  );
}

/**
 * Agrega una tabla utilizando autoTable.
 */
function agregarTabla(
  doc: jsPDF,
  columnas: string[],
  filas: (string | number)[][],
  opciones?: {
    fontSize?: number;
    columnStyles?: Record<
      number,
      {
        cellWidth?: number;
        halign?: 'left' | 'center' | 'right';
      }
    >;
  }
) {
  const alto = doc.internal.pageSize.getHeight();
  const margenInferior = 25;

  let y = obtenerPosicionY(doc);

  // Si no queda espacio suficiente ni para comenzar
  // la tabla, pasamos a la siguiente página.
  if (y + 15 > alto - margenInferior) {
    doc.addPage();

    limpiarPosicionY(doc);

    y = 20;
  }

  autoTable(doc, {
    startY: y,
    head: [columnas],
    body: filas,
    pageBreak: 'auto',

    theme: 'grid',

    margin: {
      left: 15,
      right: 15,
      bottom: 22,
    },

    styles: {
      font: 'helvetica',
      fontSize: opciones?.fontSize || 8.5,
      textColor: COLOR_TEXTO,
      cellPadding: 3,
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
      valign: 'middle',
    },

    headStyles: {
      fillColor: COLOR_PRINCIPAL,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: opciones?.fontSize || 8.5,
    },

    alternateRowStyles: {
      fillColor: COLOR_GRIS_CLARO,
    },

    columnStyles: opciones?.columnStyles,

    didDrawPage: () => {
      // autoTable se encarga de repetir los encabezados
      // de las tablas cuando continúan en otra página.
    },
  });
}

/**
 * Genera y descarga el reporte PDF.
 */
export function generarReportePdf(
  reporte: ReporteCompleto,
  secciones: SeccionReportePDF[]
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  /*
   * =========================================================
   * ENCABEZADO
   * =========================================================
   */

  doc.setFillColor(...COLOR_PRINCIPAL);

  doc.rect(
    0,
    0,
    210,
    42,
    'F'
  );

  doc.setTextColor(255, 255, 255);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);

  doc.text(
    'Reporte de Gestión',
    15,
    18
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);

  doc.text(
    'Sistema de Reservas',
    15,
    27
  );

  doc.setFontSize(9);

  doc.text(
    `Período: ${formatearFecha(reporte.filtros.fechaDesde)} - ${formatearFecha(reporte.filtros.fechaHasta)}`,
    15,
    35
  );

  doc.text(
    `Generado: ${new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date())}`,
    195,
    35,
    {
      align: 'right',
    }
  );

  doc.setTextColor(...COLOR_TEXTO);

  /*
   * =========================================================
   * FILTROS APLICADOS
   * =========================================================
   */

  const filtrosAplicados: string[] = [];

  if (reporte.filtros.idRecurso) {
    filtrosAplicados.push(
      `Recurso: ${reporte.filtros.idRecurso}`
    );
  }

  if (reporte.filtros.tipoCliente) {
    filtrosAplicados.push(
      `Tipo de cliente: ${reporte.filtros.tipoCliente}`
    );
  }

  if (reporte.filtros.estadoReserva) {
    filtrosAplicados.push(
      `Estado: ${reporte.filtros.estadoReserva}`
    );
  }

  if (filtrosAplicados.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);

    doc.text(
      'Filtros aplicados:',
      15,
      52
    );

    doc.setFont('helvetica', 'normal');

    doc.text(
      filtrosAplicados.join(' | '),
      15,
      58
    );

    establecerPosicionY(doc, 63);
  } else {
    establecerPosicionY(doc, 52);
  }

  /*
   * =========================================================
   * 1. RESUMEN EJECUTIVO
   * =========================================================
   */

  if (secciones.includes('resumen')) {
    agregarTituloSeccion(
      doc,
      '1',
      'Resumen ejecutivo'
    );

    const resumen = reporte.resumen;

    agregarTabla(
      doc,
      [
        'Indicador',
        'Valor',
      ],
      [
        [
          'Total de reservas',
          resumen.totalReservas,
        ],
        [
          'Reservas confirmadas',
          resumen.reservasConfirmadas,
        ],
        [
          'Reservas pendientes',
          resumen.reservasPendientes,
        ],
        [
          'Reservas canceladas',
          resumen.reservasCanceladas,
        ],
        [
          'Clientes únicos',
          resumen.clientesUnicos,
        ],
        [
          'Recursos activos',
          resumen.recursosActivos,
        ],
        [
          'Ingresos totales',
          formatearMoneda(resumen.ingresosTotales),
        ],
        [
          'Ticket promedio',
          formatearMoneda(resumen.ticketPromedio),
        ],
      ],
      {
        columnStyles: {
          0: {
            cellWidth: 100,
          },
          1: {
            cellWidth: 80,
            halign: 'right',
          },
        },
      }
    );
  }

  /*
   * =========================================================
   * 2. RESERVAS POR RECURSO
   * =========================================================
   */

  if (secciones.includes('recursos')) {
    agregarTituloSeccion(
      doc,
      '2',
      'Reservas por recurso'
    );

    agregarTabla(
      doc,
      [
        'Recurso',
        'Tipo',
        'Total',
        'Confirmadas',
        'Canceladas',
        'Ingresos',
      ],
      reporte.reservasPorRecurso.map((r) => [
        r.nombre,
        r.tipo_recurso,
        r.totalReservas,
        r.reservasConfirmadas,
        r.reservasCanceladas,
        formatearMoneda(r.ingresos),
      ]),
      {
        fontSize: 8,
      }
    );
  }

  /*
   * =========================================================
   * 3. DEMANDA Y HORARIOS
   * =========================================================
   */

  if (secciones.includes('demanda')) {
    agregarTituloSeccion(
      doc,
      '3',
      'Demanda y horarios'
    );

    agregarSubtitulo(
      doc,
      'Demanda por horario'
    );

    agregarTabla(
      doc,
      [
        'Horario',
        'Cantidad de reservas',
      ],
      reporte.demandaPorHorario.map((item) => [
        item.hora,
        item.cantidad,
      ]),
      {
        columnStyles: {
          0: {
            cellWidth: 80,
          },
          1: {
            cellWidth: 100,
            halign: 'right',
          },
        },
      }
    );

    agregarSubtitulo(
      doc,
      'Demanda por día de semana'
    );

    agregarTabla(
      doc,
      [
        'Día',
        'Cantidad de reservas',
      ],
      reporte.demandaPorDiaSemana.map((item) => [
        item.dia,
        item.cantidad,
      ]),
      {
        columnStyles: {
          0: {
            cellWidth: 80,
          },
          1: {
            cellWidth: 100,
            halign: 'right',
          },
        },
      }
    );
  }

  /*
   * =========================================================
   * 4. CLIENTES
   * =========================================================
   */

  if (secciones.includes('clientes')) {
    agregarTituloSeccion(
      doc,
      '4',
      'Clientes'
    );

    agregarTabla(
      doc,
      [
        'Cliente',
        'Tipo',
        'Reservas',
        'Total gastado',
      ],
      reporte.clientes.map((cliente) => [
        `${cliente.nombre} ${cliente.apellido}`.trim(),
        cliente.tipo_cliente,
        cliente.totalReservas,
        formatearMoneda(cliente.totalGastado),
      ]),
      {
        columnStyles: {
          0: {
            cellWidth: 75,
          },
          1: {
            cellWidth: 35,
          },
          2: {
            cellWidth: 30,
            halign: 'center',
          },
          3: {
            cellWidth: 40,
            halign: 'right',
          },
        },
      }
    );
  }

  /*
   * =========================================================
   * 5. INGRESOS
   * =========================================================
   */

  if (secciones.includes('ingresos')) {
    agregarTituloSeccion(
      doc,
      '5',
      'Ingresos'
    );

    agregarSubtitulo(
      doc,
      'Ingresos por estado de pago'
    );

    agregarTabla(
      doc,
      [
        'Estado de pago',
        'Cantidad',
        'Monto',
      ],
      reporte.ingresosPorEstadoPago.map((item) => [
        item.estado_pago,
        item.cantidad,
        formatearMoneda(item.monto),
      ]),
      {
        columnStyles: {
          0: {
            cellWidth: 80,
          },
          1: {
            cellWidth: 40,
            halign: 'center',
          },
          2: {
            cellWidth: 60,
            halign: 'right',
          },
        },
      }
    );

    agregarSubtitulo(
      doc,
      'Ingresos por recurso'
    );

    agregarTabla(
      doc,
      [
        'Recurso',
        'Ingresos',
      ],
      reporte.ingresosPorRecurso.map((item) => [
        item.nombre,
        formatearMoneda(item.ingresos),
      ]),
      {
        columnStyles: {
          0: {
            cellWidth: 110,
          },
          1: {
            cellWidth: 70,
            halign: 'right',
          },
        },
      }
    );
  }

  /*
   * =========================================================
   * 6. CANCELACIONES
   * =========================================================
   */

  if (secciones.includes('cancelaciones')) {
    agregarTituloSeccion(
      doc,
      '6',
      'Cancelaciones'
    );

    agregarTabla(
      doc,
      [
        'Indicador',
        'Cantidad',
      ],
      [
        [
          'Reservas canceladas',
          reporte.cancelaciones.totalCanceladas,
        ],
      ],
      {
        columnStyles: {
          0: {
            cellWidth: 120,
          },
          1: {
            cellWidth: 60,
            halign: 'right',
          },
        },
      }
    );

    if (reporte.cancelaciones.detalle.length > 0) {
      agregarSubtitulo(
        doc,
        'Detalle'
      );

      agregarTabla(
        doc,
        [
          'Reserva',
          'Fecha',
          'Motivo',
        ],
        reporte.cancelaciones.detalle.map((item) => [
          item.id_reserva,
          formatearFecha(item.fecha_reserva),
          item.motivo,
        ])
      );
    }
  }

  /*
   * =========================================================
   * 7. BLOQUEOS Y MANTENIMIENTO
   * =========================================================
   */

  if (secciones.includes('bloqueos')) {
    agregarTituloSeccion(
      doc,
      '7',
      'Bloqueos y mantenimiento'
    );

    agregarTabla(
      doc,
      [
        'Recurso',
        'Fecha',
        'Inicio',
        'Fin',
        'Motivo',
        'Estado',
      ],
      reporte.bloqueos.map((bloqueo) => [
        bloqueo.nombre_recurso,
        formatearFecha(bloqueo.fecha),
        formatearHora(bloqueo.hora_inicio),
        formatearHora(bloqueo.hora_fin),
        bloqueo.motivo || '-',
        bloqueo.activo
          ? 'Activo'
          : 'Inactivo',
      ]),
      {
        fontSize: 7.5,
      }
    );
  }

  /*
   * =========================================================
   * 8. OCUPACIÓN
   * =========================================================
   */

  if (secciones.includes('ocupacion')) {
    agregarTituloSeccion(
      doc,
      '8',
      'Ocupación'
    );

    agregarTabla(
      doc,
      [
        'Recurso',
        'Min. disponibles',
        'Min. reservados',
        'Ocupación',
      ],
      reporte.ocupacion.map((item) => [
        item.nombre,
        item.minutosDisponibles,
        item.minutosReservados,
        `${item.porcentajeOcupacion}%`,
      ]),
      {
        columnStyles: {
          0: {
            cellWidth: 70,
          },
          1: {
            cellWidth: 40,
            halign: 'right',
          },
          2: {
            cellWidth: 40,
            halign: 'right',
          },
          3: {
            cellWidth: 30,
            halign: 'right',
          },
        },
      }
    );
  }

  /*
   * =========================================================
   * 9. DETALLE DE RESERVAS
   * =========================================================
   */

  if (secciones.includes('detalle')) {
    agregarTituloSeccion(
      doc,
      '9',
      'Detalle de reservas'
    );

    agregarTabla(
      doc,
      [
        'Fecha',
        'Recurso',
        'Cliente',
        'Tipo',
        'Inicio',
        'Fin',
        'Duración',
        'Estado',
        'Importe',
      ],
      reporte.detalleReservas.map((reserva) => [
        formatearFecha(reserva.fecha_reserva),
        reserva.recurso_nombre,
        reserva.cliente_nombre,
        reserva.cliente_tipo,
        formatearHora(reserva.hora_inicio),
        formatearHora(reserva.hora_fin),
        `${reserva.duracion_minutos || 0} min`,
        reserva.estado_reserva,
        formatearMoneda(reserva.costo_reserva),
      ]),
      {
        fontSize: 6.5,
      }
    );
  }

  /*
   * =========================================================
   * PIE DE PÁGINA
   * =========================================================
   */

  agregarPieDePagina(doc);

  /*
   * =========================================================
   * DESCARGA
   * =========================================================
   */

  const nombreArchivo =
    `reporte-gestion-${reporte.filtros.fechaDesde}-${reporte.filtros.fechaHasta}.pdf`;

  doc.save(nombreArchivo);
}