import React, { useState } from 'react';
import { type Pago } from '@/lib/usePagosRealtime';

interface PagosListProps {
  pagos: Pago[];
  onActualizarPago: (id_pago: number, data: { estado_pago: string; mp_id?: string }) => Promise<void>;
  onEditPago: (pago: Pago) => void;
  convertirFechaABuenosAires?: (fechaUTC: string) => string;
}

export default function PagosList({ pagos, onActualizarPago, onEditPago, convertirFechaABuenosAires }: PagosListProps) {
  const [actualizandoPago, setActualizandoPago] = useState<number | null>(null);

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'aprobado':
        return 'bg-green-100 text-green-800';
      case 'pendiente':
        return 'bg-yellow-100 text-yellow-800';
      case 'cancelado':
        return 'bg-red-100 text-red-800';
      case 'desconocido':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleCambiarEstado = async (id_pago: number, nuevoEstado: string) => {
    setActualizandoPago(id_pago);
    try {
      await onActualizarPago(id_pago, { estado_pago: nuevoEstado });
    } catch {
    } finally {
      setActualizandoPago(null);
    }
  };

  const formatearFecha = (fecha: string) => {
    // Si hay función de conversión personalizada, usarla (para Buenos Aires)
    if (convertirFechaABuenosAires) {
      return convertirFechaABuenosAires(fecha);
    }
    
    try {
      // Fallback por defecto - timestamptz se maneja directamente
      const fechaObj = new Date(fecha);
      
      // Validar que la fecha es válida
      if (isNaN(fechaObj.getTime())) {
        return 'Fecha inválida';
      }
      
      return fechaObj.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Error de formato';
    }
  };

  const formatearMonto = (monto: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'ARS'
    }).format(monto);
  };

  if (pagos.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-500">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No hay pagos registrados</h3>
          <p className="mt-2 text-sm text-gray-500">
            Los pagos aparecerán aquí cuando se registren en el sistema.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow overflow-hidden sm:rounded-md">
      <ul className="divide-y divide-gray-200">
        {pagos.map((pago) => (
          <li key={pago.id_pago} className="px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-3">
                      <p className="text-sm font-medium text-gray-900">
                        Pago #{pago.id_pago}
                      </p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEstadoColor(pago.estado_pago)}`}>
                        {pago.estado_pago.charAt(0).toUpperCase() + pago.estado_pago.slice(1)}
                      </span>
                    </div>
                    
                    <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-3">
                      <div>
                        <p className="text-xs text-gray-500">Monto</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {formatearMonto(pago.monto)}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs text-gray-500">Reserva</p>
                        <p className="text-sm text-gray-900">
                          #{pago.id_reserva}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs text-gray-500">MP ID</p>
                        <p className="text-sm text-gray-900">
                          {pago.mp_id || 'N/A'}
                        </p>
                      </div>
                      
                      <div>
                        <p className="text-xs text-gray-500">Fecha de pago</p>
                        <p className="text-sm text-gray-900">
                          {formatearFecha(pago.fecha_pago)}
                        </p>
                      </div>
                      
                      {pago.mp_id && (
                        <div>
                          <p className="text-xs text-gray-500">MP ID</p>
                          <p className="text-sm text-gray-900 font-mono">
                            {pago.mp_id}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {/* Botones de cambio rápido de estado */}
                    {pago.estado_pago === 'pendiente' && (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleCambiarEstado(pago.id_pago, 'Aprobado')}
                          disabled={actualizandoPago === pago.id_pago}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actualizandoPago === pago.id_pago ? (
                            <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : null}
                          Confirmar
                        </button>
                        <button
                          onClick={() => handleCambiarEstado(pago.id_pago, 'cancelado')}
                          disabled={actualizandoPago === pago.id_pago}
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                    
                    {/* Botón de editar */}
                    <button
                      onClick={() => onEditPago(pago)}
                      className="inline-flex items-center p-1.5 border border-transparent rounded-full text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
