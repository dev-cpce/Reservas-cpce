'use client';

import type { FiltrosReporte as FiltrosReporteType, RecursoFiltroOpcion } from '@/types/reportes';

interface FiltrosReporteProps {
  filtros: FiltrosReporteType;
  recursos: RecursoFiltroOpcion[];
  onChange: (filtros: FiltrosReporteType) => void;
  onBuscar: () => void;
  isLoading: boolean;
}

export default function FiltrosReporte({ filtros, recursos, onChange, onBuscar, isLoading }: FiltrosReporteProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">Filtros</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde</label>
          <input
            type="date"
            value={filtros.fechaDesde}
            onChange={(e) => onChange({ ...filtros, fechaDesde: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta</label>
          <input
            type="date"
            value={filtros.fechaHasta}
            onChange={(e) => onChange({ ...filtros, fechaHasta: e.target.value })}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recurso</label>
          <select
            value={filtros.idRecurso ?? ''}
            onChange={(e) => onChange({ ...filtros, idRecurso: e.target.value ? Number(e.target.value) : null })}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            {recursos.map((recurso) => (
              <option key={recurso.id_recurso} value={recurso.id_recurso}>{recurso.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cliente</label>
          <select
            value={filtros.tipoCliente ?? ''}
            onChange={(e) => onChange({ ...filtros, tipoCliente: e.target.value === '' ? null : (e.target.value as 'SOCIO' | 'NO_SOCIO') })}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            <option value="SOCIO">Socio</option>
            <option value="NO_SOCIO">No socio</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estado de reserva</label>
          <select
            value={filtros.estadoReserva ?? ''}
            onChange={(e) => onChange({ ...filtros, estadoReserva: e.target.value || null })}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="cancelada">Cancelada</option>
            <option value="completada">Completada</option>
          </select>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onBuscar}
          disabled={isLoading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {isLoading ? 'Generando...' : 'Generar reporte'}
        </button>
      </div>
    </div>
  );
}
