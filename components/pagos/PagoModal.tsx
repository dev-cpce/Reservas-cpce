import React, { useState, useEffect } from 'react';
import { type Pago } from '@/lib/usePagosRealtime';
import { obtenerReservas } from '@/app/api/reservas/actions';
import type { Reserva } from '@/types';

// Tipo para el formulario de pago (sin campos autogenerados)
type PagoFormData = Omit<Pago, 'id_pago' | 'fecha_pago'>;

interface PagoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pago: PagoFormData) => Promise<void>;
  pago?: Pago | null;
  title: string;
}

export default function PagoModal({ isOpen, onClose, onSave, pago, title }: PagoModalProps) {
  const [formData, setFormData] = useState<PagoFormData>({
    id_reserva: 0,
    monto: 0,
    estado_pago: 'pendiente',
    mp_id: ''
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reservas seleccionables: pendientes + la ya asociada al pago que se está editando.
  const [reservasDisponibles, setReservasDisponibles] = useState<Reserva[]>([]);
  const [cargandoReservas, setCargandoReservas] = useState(false);
  const [errorReservas, setErrorReservas] = useState('');

  // Cargar reservas pendientes (más la del pago en edición, si ya no está pendiente)
  // reutilizando obtenerReservas(), que ya resuelve cliente/recurso sin N+1 queries.
  useEffect(() => {
    if (!isOpen) return;

    const idReservaEnEdicion = pago?.id_reserva;

    const cargarReservas = async () => {
      setCargandoReservas(true);
      setErrorReservas('');
      try {
        const todasLasReservas: Reserva[] = await obtenerReservas();
        const seleccionables = todasLasReservas.filter(reserva =>
          reserva.estado_reserva === 'pendiente' || reserva.id_reserva === idReservaEnEdicion
        );
        setReservasDisponibles(seleccionables);
      } catch {
        setErrorReservas('No se pudieron cargar las reservas pendientes');
        setReservasDisponibles([]);
      } finally {
        setCargandoReservas(false);
      }
    };

    cargarReservas();
  }, [isOpen, pago]);

  // Resetear form cuando se abre/cierra el modal
  useEffect(() => {
    if (isOpen) {
      if (pago) {
        setFormData({
          id_reserva: pago.id_reserva,
          monto: pago.monto,
          estado_pago: pago.estado_pago,
          mp_id: pago.mp_id || ''
        });
      } else {
        setFormData({
          id_reserva: 0,
          monto: 0,
          estado_pago: 'pendiente',
          mp_id: ''
        });
      }
      setErrors({});
    }
  }, [isOpen, pago]);

  // Bloquear scroll del body cuando el modal está abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  // Manejar tecla Escape para cerrar modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.id_reserva || formData.id_reserva <= 0) {
      newErrors.id_reserva = 'Debe seleccionar una reserva';
    } else if (!pago) {
      // Solo se valida contra la lista al crear: al editar, el select va deshabilitado.
      const reservaElegida = reservasDisponibles.find(r => r.id_reserva === formData.id_reserva);
      if (!reservaElegida) {
        newErrors.id_reserva = 'La reserva seleccionada no es válida';
      } else if (reservaElegida.estado_reserva !== 'pendiente') {
        newErrors.id_reserva = 'La reserva seleccionada ya no está pendiente';
      }
    }

    if (!formData.monto || formData.monto <= 0) {
      newErrors.monto = 'El monto debe ser mayor a 0';
    }

    if (!formData.estado_pago) {
      newErrors.estado_pago = 'El estado del pago es requerido';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const pagoData = {
        ...formData,
        mp_id: formData.mp_id || null
      };
      
      await onSave(pagoData);
      onClose();
    } catch {
      setErrors({ general: 'Error al guardar el pago' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'id_reserva' || name === 'monto' ? Number(value) : value
    }));
    
    // Limpiar error cuando el usuario empiece a escribir
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Al elegir una reserva, autocompleta el monto con su costo_reserva ya calculado
  // (tarifa resuelta al crear la reserva); no vuelve a calcular ningún precio.
  const handleReservaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const idReserva = Number(e.target.value);
    const reservaSeleccionada = reservasDisponibles.find(r => r.id_reserva === idReserva);

    setFormData(prev => ({
      ...prev,
      id_reserva: idReserva,
      monto: reservaSeleccionada?.costo_reserva ? reservaSeleccionada.costo_reserva : prev.monto
    }));

    if (errors.id_reserva) {
      setErrors(prev => ({ ...prev, id_reserva: '' }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto" style={{ zIndex: 9999 }}>
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Overlay de fondo */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
          style={{ zIndex: 9998 }}
        ></div>

        {/* Espaciador invisible para centrado vertical */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal content */}
        <div 
          className="relative inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6"
          style={{ zIndex: 10000 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                {title}
              </h3>

              {errors.general && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {errors.general}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="id_reserva" className="block text-sm font-medium text-gray-700">
                    Reserva *
                  </label>
                  <select
                    id="id_reserva"
                    name="id_reserva"
                    value={formData.id_reserva || ''}
                    onChange={handleReservaChange}
                    className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed ${
                      errors.id_reserva ? 'border-red-300' : 'border-gray-300'
                    }`}
                    disabled={!!pago || cargandoReservas}
                    autoFocus={!pago}
                  >
                    <option value="">
                      {cargandoReservas
                        ? 'Cargando reservas...'
                        : reservasDisponibles.length === 0
                          ? 'No hay reservas pendientes'
                          : 'Seleccione una reserva'}
                    </option>
                    {reservasDisponibles.map(reserva => {
                      const nombreCliente = reserva.cliente
                        ? `${reserva.cliente.nombre} ${reserva.cliente.apellido || ''}`.trim()
                        : 'Cliente desconocido';
                      const horaInicio = reserva.hora_inicio?.substring(0, 5) || '--:--';
                      const horaFin = reserva.hora_fin?.substring(0, 5) || '--:--';

                      return (
                        <option key={reserva.id_reserva} value={reserva.id_reserva}>
                          {`Reserva ${reserva.id_reserva} - ${nombreCliente} - ${horaInicio} - ${horaFin}`}
                        </option>
                      );
                    })}
                  </select>
                  {errorReservas && (
                    <p className="mt-1 text-sm text-red-600">{errorReservas}</p>
                  )}
                  {errors.id_reserva && (
                    <p className="mt-1 text-sm text-red-600">{errors.id_reserva}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="monto" className="block text-sm font-medium text-gray-700">
                    Monto *
                  </label>
                  <input
                    type="number"
                    id="monto"
                    name="monto"
                    value={formData.monto || ''}
                    onChange={handleChange}
                    step="0.01"
                    min="0"
                    className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.monto ? 'border-red-300' : 'border-gray-300'
                    }`}
                    placeholder="0.00"
                  />
                  {!pago && formData.id_reserva > 0 && !formData.monto && (
                    <p className="mt-1 text-sm text-amber-600">
                      Esta reserva no tiene un monto cargado. Completalo manualmente.
                    </p>
                  )}
                  {errors.monto && (
                    <p className="mt-1 text-sm text-red-600">{errors.monto}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="estado_pago" className="block text-sm font-medium text-gray-700">
                    Estado del Pago *
                  </label>
                  <select
                    id="estado_pago"
                    name="estado_pago"
                    value={formData.estado_pago}
                    onChange={handleChange}
                    className={`mt-1 block w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.estado_pago ? 'border-red-300' : 'border-gray-300'
                    }`}
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="aprobado">Aprobado</option>
                    <option value="cancelado">Cancelado</option>
                    <option value="desconocido">Desconocido</option>
                  </select>
                  {errors.estado_pago && (
                    <p className="mt-1 text-sm text-red-600">{errors.estado_pago}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="mp_id" className="block text-sm font-medium text-gray-700">
                    MercadoPago ID
                  </label>
                  <input
                    type="text"
                    id="mp_id"
                    name="mp_id"
                    value={formData.mp_id || ''}
                    onChange={handleChange}
                    className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Opcional"
                  />
                </div>

                <div className="mt-6 flex space-x-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={isSubmitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <div className="flex items-center justify-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Guardando...
                      </div>
                    ) : (
                      'Guardar'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
