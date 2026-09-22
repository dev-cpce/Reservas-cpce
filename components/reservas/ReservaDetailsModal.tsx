'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Reserva } from '@/types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface ReservaDetailsModalProps {
  reserva: Reserva;
  isOpen: boolean;
  onClose: () => void;
  onChangeStatus: (id: number, estado: string) => void;
}

export const ReservaDetailsModal = ({
  reserva,
  isOpen,
  onClose,
  onChangeStatus
}: ReservaDetailsModalProps) => {
  // Formatear fecha
  const formatearFecha = (fechaStr: string) => {
    try {
      const fecha = parseISO(fechaStr);
      return format(fecha, "EEEE d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return fechaStr;
    }
  };

  // Calcular duración en horas
  const calcularDuracion = () => {
    try {
      // Normalizar formato de hora - asegurar que tenga formato HH:MM:SS
      const normalizarHora = (hora: string) => {
        if (!hora) return '00:00:00';
        
        // Si ya tiene segundos (HH:MM:SS), usar tal como está
        if (hora.split(':').length === 3) {
          return hora;
        }
        
        // Si solo tiene HH:MM, agregar :00
        if (hora.split(':').length === 2) {
          return `${hora}:00`;
        }
        
        return hora;
      };

      const horaInicioNorm = normalizarHora(reserva.hora_inicio);
      const horaFinNorm = normalizarHora(reserva.hora_fin);
      
      const inicio = new Date(`1970-01-01T${horaInicioNorm}`);
      const fin = new Date(`1970-01-01T${horaFinNorm}`);
      
      // Verificar que las fechas sean válidas
      if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
        return 0;
      }
      
      const diferenciaMs = fin.getTime() - inicio.getTime();
      const diferenciaHoras = diferenciaMs / (1000 * 60 * 60);
      return diferenciaHoras;
    } catch {

      return 0;
    }
  };

  // Manejar cambio de estado
  const handleChangeStatus = (estado: string) => {
    onChangeStatus(reserva.id_reserva, estado);
    onClose();
  };

  // Obtener clase para el badge de estado
  const getEstadoClase = (estado: string) => {
    switch (estado) {
      case 'confirmada':
        return 'bg-green-100 text-green-800';
      case 'cancelada':
        return 'bg-red-100 text-red-800';
      case 'completada':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-10" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-25" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <div className="flex justify-between items-center mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900"
                  >
                    Detalles de la Reserva
                  </Dialog.Title>
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-500"
                    onClick={onClose}
                  >
                    <XMarkIcon className="h-6 w-6" aria-hidden="true" />
                  </button>
                </div>

                <div className="mt-2">
                  <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="font-medium text-gray-900">Información General</h4>
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getEstadoClase(
                          reserva.estado_reserva
                        )}`}
                      >
                        {reserva.estado_reserva.charAt(0).toUpperCase() + reserva.estado_reserva.slice(1)}
                      </span>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Fecha:</p>
                          <p className="text-sm font-medium">{formatearFecha(reserva.fecha_reserva)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Horario:</p>
                          <p className="text-sm font-medium">
                            {reserva.hora_inicio} - {reserva.hora_fin} ({reserva.duracion_minutos ? `${reserva.duracion_minutos} min` : `${calcularDuracion()} horas`})
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Cliente</h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium">
                        {reserva.cliente?.apellido}, {reserva.cliente?.nombre}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Recurso</h4>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm font-medium">{reserva.recurso?.nombre || reserva.cancha?.nombre}</p>
                      <p className="text-sm text-gray-500">
                        {reserva.recurso ? `${reserva.recurso.tipo_recurso}${reserva.recurso.deporte ? ` \u00b7 ${reserva.recurso.deporte}` : ''}` : (reserva.cancha ? `${reserva.cancha.tipo}vs${reserva.cancha.tipo}` : '')}
                      </p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <h4 className="font-medium text-gray-900 mb-3">Costo</h4>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">Costo total:</span>
                        <span className="text-lg font-bold text-blue-700">${(reserva.costo_reserva || reserva.costo_total || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  </div>

                  {reserva.observaciones && (
                    <div className="mb-6">
                      <h4 className="font-medium text-gray-900 mb-3">Observaciones</h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm">{reserva.observaciones}</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-8">
                  <p className="text-sm text-gray-500 mb-3">Cambiar estado:</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleChangeStatus('pendiente')}
                      className={`px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 
                        ${reserva.estado_reserva === 'pendiente' ? 'ring-2 ring-yellow-500' : ''}`}
                      disabled={reserva.estado_reserva === 'pendiente'}
                    >
                      Pendiente
                    </button>
                    <button
                      onClick={() => handleChangeStatus('confirmada')}
                      className={`px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800
                        ${reserva.estado_reserva === 'confirmada' ? 'ring-2 ring-green-500' : ''}`}
                      disabled={reserva.estado_reserva === 'confirmada'}
                    >
                      Confirmada
                    </button>
                    <button
                      onClick={() => handleChangeStatus('completada')}
                      className={`px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800
                        ${reserva.estado_reserva === 'completada' ? 'ring-2 ring-blue-500' : ''}`}
                      disabled={reserva.estado_reserva === 'completada'}
                    >
                      Completada
                    </button>
                    <button
                      onClick={() => handleChangeStatus('cancelada')}
                      className={`px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800
                        ${reserva.estado_reserva === 'cancelada' ? 'ring-2 ring-red-500' : ''}`}
                      disabled={reserva.estado_reserva === 'cancelada'}
                    >
                      Cancelada
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};