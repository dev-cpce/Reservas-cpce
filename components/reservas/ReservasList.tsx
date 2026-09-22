'use client';

import { useState } from 'react';
import { Reserva } from '@/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { ReservaDetailsModal } from './ReservaDetailsModal';
import { TiempoRestante } from './TiempoRestante';
import { 
  EyeIcon,
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

interface ReservasListProps {
  reservas: Reserva[];
  onEdit: (reserva: Reserva) => void;
  onDelete: (id: number) => void;
  onCambiarEstado: (id: number, estado: string) => void;
}

export const ReservasList = ({
  reservas,
  onEdit,
  onDelete,
  onCambiarEstado
}: ReservasListProps) => {
  const [reservaSeleccionada, setReservaSeleccionada] = useState<Reserva | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [estadoFiltro, setEstadoFiltro] = useState<string>('todos');
  
  const obtenerFechaHoy = () => {
    const hoy = new Date();
    return hoy.getFullYear() + '-' + 
           String(hoy.getMonth() + 1).padStart(2, '0') + '-' + 
           String(hoy.getDate()).padStart(2, '0');
  };
  
  const [fechaFiltro, setFechaFiltro] = useState<string>(obtenerFechaHoy());
  const [mostrarTodasLasFechas] = useState(false);

  const handleCambioEstado = (id: number, estado: string) => {
    onCambiarEstado(id, estado);
    setModalAbierto(false);
  };

  const formatearFecha = (fechaStr: string) => {
    try {
      const fecha = parseISO(fechaStr);
      return format(fecha, "dd/MM/yyyy", { locale: es });
    } catch {
      return fechaStr;
    }
  };

  const formatearHora = (horaStr: string) => {
    return horaStr.substring(0, 5);
  };

  const getEstadoClass = (estado: string) => {
    switch (estado) {
      case 'pendiente': return 'bg-yellow-100 text-yellow-800';
      case 'confirmada': return 'bg-blue-100 text-blue-800';
      case 'completada': return 'bg-green-100 text-green-800';
      case 'cancelada': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const reservasFiltradas = reservas.filter(reserva => {
    const pasaEstado = estadoFiltro === 'todos' || reserva.estado_reserva === estadoFiltro;
    
    // Filtro por fecha - usar fecha_reserva como campo principal
    const fechaReserva = reserva.fecha_reserva || reserva.fecha || '';
    const pasaFecha = mostrarTodasLasFechas || fechaReserva === fechaFiltro;
    
    return pasaEstado && pasaFecha;
  });

  return (
    <div className="bg-white shadow rounded-lg">
      {/* Header con título y filtros */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Información de reservas */}
          <div className="text-sm text-gray-600">
            {reservasFiltradas.length} {reservasFiltradas.length === 1 ? 'reserva' : 'reservas'}
            {!mostrarTodasLasFechas && ' para hoy'}
          </div>
        </div>
        
        {/* Controles de filtro */}
        <div className="mt-4 flex flex-col sm:flex-row gap-3">

          {/* Selector de fecha específica */}
          {!mostrarTodasLasFechas && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Fecha:</label>
              <input
                type="date"
                value={fechaFiltro}
                onChange={(e) => setFechaFiltro(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={() => setFechaFiltro(obtenerFechaHoy())}
                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
              >
                Hoy
              </button>
            </div>
          )}
          
          {/* Filtro de estado */}
          <select
            className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
          >
            <option value="todos">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>
      </div>
      
      {/* Tabla de reservas */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nro. Reserva</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Horario</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurso</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Costo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reservasFiltradas.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                  {mostrarTodasLasFechas 
                    ? "No se encontraron reservas" 
                    : fechaFiltro === new Date().toISOString().split('T')[0]
                      ? "No hay reservas para hoy"
                      : `No hay reservas para ${formatearFecha(fechaFiltro)}`
                  }
                </td>
              </tr>
            ) : (
              reservasFiltradas.map((reserva) => (
                <tr key={reserva.id_reserva} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    #{reserva.id_reserva}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatearFecha(reserva.fecha_reserva)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatearHora(reserva.hora_inicio)} - {formatearHora(reserva.hora_fin)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {reserva.cliente ? `${reserva.cliente.nombre} ${reserva.cliente.apellido}` : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {reserva.recurso?.nombre || reserva.cancha?.nombre || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${(reserva.costo_reserva || reserva.costo_total || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-col items-start space-y-2">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getEstadoClass(reserva.estado_reserva)}`}>
                        {reserva.estado_reserva.charAt(0).toUpperCase() + reserva.estado_reserva.slice(1)}
                      </span>
                      <TiempoRestante 
                        idReserva={reserva.id_reserva}
                        estadoReserva={reserva.estado_reserva}
                        onVencimiento={() => {

                        }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-2">
                      {/* Botones de cambio de estado para reservas pendientes */}
                      {reserva.estado_reserva === 'pendiente' && (
                        <>
                          <button
                            onClick={() => onCambiarEstado(reserva.id_reserva, 'confirmada')}
                            className="text-green-600 hover:text-green-900"
                            title="Confirmar pago"
                          >
                            <CheckCircleIcon className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => onCambiarEstado(reserva.id_reserva, 'cancelada')}
                            className="text-red-600 hover:text-red-900"
                            title="Cancelar reserva"
                          >
                            <XCircleIcon className="h-5 w-5" />
                          </button>
                        </>
                      )}
                      
                      {/* Botón para ver detalles */}
                      <button
                        onClick={() => {
                          setReservaSeleccionada(reserva);
                          setModalAbierto(true);
                        }}
                        className="text-gray-600 hover:text-gray-900"
                        title="Ver detalles"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                      
                      {/* Botón de editar - solo para reservas no confirmadas */}
                      {reserva.estado_reserva !== 'confirmada' && (
                        <button
                          onClick={() => onEdit(reserva)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar reserva"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      )}
                      
                      {/* Botón de eliminar - solo para reservas no confirmadas */}
                      {reserva.estado_reserva !== 'confirmada' && (
                        <button
                          onClick={() => onDelete(reserva.id_reserva)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar reserva"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Modal de detalles */}
      {reservaSeleccionada && (
        <ReservaDetailsModal
          reserva={reservaSeleccionada}
          isOpen={modalAbierto}
          onClose={() => setModalAbierto(false)}
          onChangeStatus={handleCambioEstado}
        />
      )}
    </div>
  );
};

export default ReservasList;