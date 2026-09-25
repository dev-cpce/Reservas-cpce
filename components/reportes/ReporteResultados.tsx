'use client';

import { CalendarIcon, CurrencyDollarIcon, UserGroupIcon, TableCellsIcon } from '@heroicons/react/24/outline';
import StatCard from '@/components/StatCard';
import TablaSeccionReporte from './TablaSeccionReporte';
import type { ReporteCompleto } from '@/types/reportes';

interface ReporteResultadosProps {
  reporte: ReporteCompleto;
}

// Renderiza las 9 secciones del reporte a partir de los datos ya calculados en el servidor.
export default function ReporteResultados({ reporte }: ReporteResultadosProps) {
  const {
    resumen,
    reservasPorRecurso,
    demandaPorHorario,
    demandaPorDiaSemana,
    clientes,
    ingresosPorEstadoPago,
    ingresosPorRecurso,
    cancelaciones,
    bloqueos,
    ocupacion,
    detalleReservas
  } = reporte;

  return (
    <div>
      {/* 1. Resumen ejecutivo */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Resumen Ejecutivo</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total de Reservas"
            value={resumen.totalReservas}
            description={`${resumen.reservasConfirmadas} confirmadas • ${resumen.reservasPendientes} pendientes`}
            icon={<CalendarIcon className="h-6 w-6" />}
          />
          <StatCard
            title="Ingresos Totales"
            value={`$${resumen.ingresosTotales.toLocaleString()}`}
            description={`Ticket promedio: $${resumen.ticketPromedio.toFixed(2)}`}
            icon={<CurrencyDollarIcon className="h-6 w-6" />}
          />
          <StatCard
            title="Clientes Únicos"
            value={resumen.clientesUnicos}
            description="En el período seleccionado"
            icon={<UserGroupIcon className="h-6 w-6" />}
          />
          <StatCard
            title="Recursos Activos"
            value={resumen.recursosActivos}
            description={`${resumen.reservasCanceladas} reservas canceladas`}
            icon={<TableCellsIcon className="h-6 w-6" />}
          />
        </div>
      </div>

      {/* 2. Reservas por recurso */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Reservas por Recurso</h2>
      <TablaSeccionReporte
        titulo="Reservas por Recurso"
        columnas={['Recurso', 'Tipo', 'Total', 'Confirmadas', 'Canceladas', 'Ingresos']}
        filas={reservasPorRecurso.map((r) => [r.nombre, r.tipo_recurso, r.totalReservas, r.reservasConfirmadas, r.reservasCanceladas, `$${r.ingresos.toLocaleString()}`])}
      />

      {/* 3. Demanda y horarios */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Demanda y Horarios</h2>
      <TablaSeccionReporte
        titulo="Demanda por Horario"
        descripcion="Cantidad de reservas agrupadas por horario de inicio (slots de 30 minutos)."
        columnas={['Horario', 'Cantidad de Reservas']}
        filas={demandaPorHorario.map((d) => [d.hora, d.cantidad])}
      />
      <TablaSeccionReporte
        titulo="Demanda por Día de la Semana"
        columnas={['Día', 'Cantidad de Reservas']}
        filas={demandaPorDiaSemana.map((d) => [d.dia, d.cantidad])}
      />

      {/* 4. Clientes */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Clientes</h2>
      <TablaSeccionReporte
        titulo="Clientes"
        columnas={['Cliente', 'Tipo', 'Reservas', 'Total Gastado']}
        filas={clientes.map((c) => [`${c.nombre} ${c.apellido}`.trim(), c.tipo_cliente, c.totalReservas, `$${c.totalGastado.toLocaleString()}`])}
      />

      {/* 5. Ingresos */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Ingresos</h2>
      <TablaSeccionReporte
        titulo="Ingresos por Estado de Pago"
        columnas={['Estado de Pago', 'Cantidad', 'Monto']}
        filas={ingresosPorEstadoPago.map((i) => [i.estado_pago, i.cantidad, `$${i.monto.toLocaleString()}`])}
      />
      <TablaSeccionReporte
        titulo="Ingresos por Recurso"
        columnas={['Recurso', 'Ingresos']}
        filas={ingresosPorRecurso.map((i) => [i.nombre, `$${i.ingresos.toLocaleString()}`])}
      />


      {/* 7. Bloqueos y mantenimiento */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Bloqueos y Mantenimiento</h2>
      <TablaSeccionReporte
        titulo="Bloqueos del Período"
        columnas={['Recurso', 'Fecha', 'Hora Inicio', 'Hora Fin', 'Motivo', 'Activo']}
        filas={bloqueos.map((b) => [b.nombre_recurso, b.fecha, b.hora_inicio?.substring(0, 5) || '', b.hora_fin?.substring(0, 5) || '', b.motivo || '-', b.activo ? 'Sí' : 'No'])}
      />

      {/* 8. Ocupación */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Ocupación</h2>
      <TablaSeccionReporte
        titulo="Ocupación por Recurso"
        descripcion="Minutos reservados vs. minutos de apertura configurados en el período (según recurso_horario)."
        columnas={['Recurso', 'Minutos Disponibles', 'Minutos Reservados', '% Ocupación']}
        filas={ocupacion.map((o) => [o.nombre, o.minutosDisponibles, o.minutosReservados, `${o.porcentajeOcupacion}%`])}
      />

      {/* 9. Detalle de reservas */}
      <h2 className="text-xl font-bold text-gray-900 mb-3">Detalle de Reservas</h2>
      <TablaSeccionReporte
        titulo="Detalle de Reservas"
        columnas={['Nro.', 'Fecha', 'Horario', 'Recurso', 'Cliente', 'Tipo Cliente', 'Estado', 'Costo']}
        filas={detalleReservas.map((r) => [
          r.id_reserva,
          r.fecha_reserva,
          `${r.hora_inicio?.substring(0, 5) || ''} - ${r.hora_fin?.substring(0, 5) || ''}`,
          r.recurso_nombre,
          r.cliente_nombre,
          r.cliente_tipo,
          r.estado_reserva,
          `$${(r.costo_reserva || 0).toLocaleString()}`
        ])}
      />
    </div>
  );
}
