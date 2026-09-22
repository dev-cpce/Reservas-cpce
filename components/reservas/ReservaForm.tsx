'use client';

import { useState, useEffect } from 'react';
import { Reserva, Cliente, Recurso, NuevaReservaRecursoInput } from '@/types';
import { CalendarIcon, ClockIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { obtenerReservasPorFechaYRecurso } from '@/app/api/reservas/actions';
import { crearCliente } from '@/app/api/clientes/actions';
import { DURACIONES_VALIDAS_MINUTOS, esDuracionValida, calcularHoraFinPorDuracion } from '@/lib/recursoDisponibilidad';

interface ReservaFormProps {
  reserva?: Reserva;
  clientes: Cliente[];
  recursos: Recurso[];
  onSubmit: (data: NuevaReservaRecursoInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
  onClienteCreado?: (cliente: Cliente) => void;
}

export default function ReservaForm({
  reserva,
  clientes,
  recursos,
  onSubmit,
  onCancel,
  isSubmitting,
  onClienteCreado
}: ReservaFormProps) {

  const [clienteId, setClienteId] = useState<number>(reserva?.id_cliente || 0);
  const [recursoId, setRecursoId] = useState<number>(reserva?.id_recurso || 0);
  
  const [busquedaCliente, setBusquedaCliente] = useState<string>('');
  const [clientesFiltrados, setClientesFiltrados] = useState<Cliente[]>([]);
  const [mostrarCrearCliente, setMostrarCrearCliente] = useState<boolean>(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    apellido: '',
    telefono: ''
  });
  const [creandoCliente, setCreandoCliente] = useState<boolean>(false);
  
  const esRecursoDisponible = (recurso: Recurso) => recurso.activo && recurso.estado === 'DISPONIBLE';
  
  useEffect(() => {
    if (!busquedaCliente.trim()) {
      setClientesFiltrados(clientes.slice(0, 10));
    } else {
      const filtrados = clientes.filter(cliente => {
        const nombre = `${cliente.nombre} ${cliente.apellido}`.toLowerCase();
        const telefono = cliente.telefono?.toLowerCase() || '';
        const busqueda = busquedaCliente.toLowerCase();
        
        return nombre.includes(busqueda) || 
               telefono.includes(busqueda);
      });
      setClientesFiltrados(filtrados.slice(0, 10));
    }
  }, [busquedaCliente, clientes]);

  const handleCrearCliente = async () => {
    if (!nuevoCliente.nombre.trim() || !nuevoCliente.apellido.trim()) {
      setError('El nombre y apellido son obligatorios');
      return;
    }

    setCreandoCliente(true);
    try {
      const clienteCreado = await crearCliente({
        nombre: nuevoCliente.nombre.trim(),
        apellido: nuevoCliente.apellido.trim(),
        telefono: nuevoCliente.telefono.trim()
      });

      // El clienteCreado ya es el objeto cliente completo de la BD
      // Notificar al componente padre para actualizar la lista
      if (onClienteCreado && clienteCreado) {
        onClienteCreado(clienteCreado);
      }
      
      // Actualizar el estado para incluir el nuevo cliente - usar solo el ID
      if (clienteCreado) {
        setClienteId(clienteCreado.id_cliente);
      }
      setBusquedaCliente(`${nuevoCliente.nombre} ${nuevoCliente.apellido}`);
      
      // Limpiar el formulario de nuevo cliente
      setNuevoCliente({ nombre: '', apellido: '', telefono: '' });
      setMostrarCrearCliente(false);
      
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error al crear el cliente');
    } finally {
      setCreandoCliente(false);
    }
  };


  
  const obtenerFechaLocal = () => {
    return new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };
  
  const [fecha, setFecha] = useState<string>(reserva?.fecha_reserva || reserva?.fecha || obtenerFechaLocal());
  const [horaInicio, setHoraInicio] = useState<string>(reserva?.hora_inicio || '');
  const [duracionMinutos, setDuracionMinutos] = useState<number>(reserva?.duracion_minutos || DURACIONES_VALIDAS_MINUTOS[0]);
  // hora_fin ya no se elige manualmente: se deriva de hora_inicio + duracion_minutos.
  const horaFin = horaInicio ? calcularHoraFinPorDuracion(horaInicio, duracionMinutos) : '';
  
  const generarHorarios = () => {
    const horarios = [];
    for (let i = 8; i <= 23; i++) {
      const hora = i.toString().padStart(2, '0') + ':00';
      horarios.push(hora);
    }
    return horarios;
  };

  const [error, setError] = useState<string>('');
  const [horariosOcupados, setHorariosOcupados] = useState<string[]>([]);

  useEffect(() => {
    const cargarReservasExistentes = async () => {
      if (fecha && recursoId) {
        try {
          const reservas = await obtenerReservasPorFechaYRecurso(fecha, recursoId);
          
          const ocupados = reservas.map(reserva => `${reserva.hora_inicio}-${reserva.hora_fin}`);
          setHorariosOcupados(ocupados);
        } catch {
          // Error silencioso
        }
      }
    };
    
    cargarReservasExistentes();
  }, [fecha, recursoId]);
  
  const validarFormulario = (): boolean => {
    if (!clienteId) {
      setError('Debe seleccionar un cliente');
      return false;
    }
    
    if (!recursoId) {
      setError('Debe seleccionar un recurso');
      return false;
    }
    
    const recursoSeleccionado = recursos.find(r => r.id_recurso === recursoId);
    if (recursoSeleccionado && !esRecursoDisponible(recursoSeleccionado)) {
      setError('El recurso seleccionado no está disponible. Por favor, seleccione otro.');
      return false;
    }
    
    if (!fecha) {
      setError('Debe seleccionar una fecha para la reserva');
      return false;
    }
    
    const [año, mes, dia] = fecha.split('-').map(Number);
    const fechaSeleccionada = new Date(año, mes - 1, dia);
    const hoy = new Date();
    
    const fechaSeleccionadaSolo = new Date(fechaSeleccionada.getFullYear(), fechaSeleccionada.getMonth(), fechaSeleccionada.getDate());
    const hoySolo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

    if (fechaSeleccionadaSolo < hoySolo) {
      setError('No puede realizar reservas en fechas pasadas');
      return false;
    }
    
    if (!horaInicio) {
      setError('Debe especificar la hora de inicio');
      return false;
    }
    
    if (!esDuracionValida(duracionMinutos)) {
      setError(`Duración no válida. Valores permitidos: ${DURACIONES_VALIDAS_MINUTOS.join(' o ')} minutos.`);
      return false;
    }
    
    return true;
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!validarFormulario()) return;
    
    try {
      await onSubmit({
        id_cliente: clienteId,
        id_recurso: recursoId,
        fecha_reserva: fecha,
        hora_inicio: horaInicio,
        duracion_minutos: duracionMinutos
      });
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ha ocurrido un error al procesar la reserva');
      }
    }
  };
  
  const fechaMinima = obtenerFechaLocal();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-6">
        {reserva ? 'Editar Reserva' : 'Nueva Reserva'}
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Selección de Cliente Mejorada */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cliente
            </label>
            
            {/* Campo de búsqueda */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="pl-10 pr-10 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                placeholder="Buscar cliente por nombre, apellido o teléfono..."
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                disabled={isSubmitting}
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  type="button"
                  onClick={() => setMostrarCrearCliente(true)}
                  className="text-blue-600 hover:text-blue-700"
                  title="Crear nuevo cliente"
                >
                  <PlusIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
            
            {/* Lista de clientes filtrados */}
            {busquedaCliente && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-300 rounded-md bg-white shadow-sm">
                {clientesFiltrados.length > 0 ? (
                  clientesFiltrados.map((cliente) => (
                    <button
                      key={cliente.id_cliente}
                      type="button"
                      className={`w-full text-left px-4 py-2 hover:bg-gray-50 flex justify-between items-center ${
                        clienteId === cliente.id_cliente ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                      onClick={() => {
                        setClienteId(cliente.id_cliente);
                        setBusquedaCliente(`${cliente.nombre} ${cliente.apellido}`);
                      }}
                    >
                      <div>
                        <div className="font-medium text-gray-900">
                          {cliente.nombre} {cliente.apellido}
                        </div>
                        <div className="text-sm text-gray-500">
                          {cliente.telefono && `Tel: ${cliente.telefono}`}
                        </div>
                      </div>
                      {clienteId === cliente.id_cliente && (
                        <div className="text-blue-600 text-sm font-medium">Seleccionado</div>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-gray-500 text-center">
                    No se encontraron clientes
                    <button
                      type="button"
                      onClick={() => setMostrarCrearCliente(true)}
                      className="ml-2 text-blue-600 hover:text-blue-700 underline"
                    >
                      Crear nuevo cliente
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {/* Cliente seleccionado */}
            {clienteId > 0 && !busquedaCliente && (
              <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-md">
                <div className="text-sm font-medium text-green-800">
                  Cliente seleccionado: {clientes.find(c => c.id_cliente === clienteId)?.nombre} {clientes.find(c => c.id_cliente === clienteId)?.apellido}
                </div>
              </div>
            )}
          </div>

          {/* Modal para crear nuevo cliente */}
          {mostrarCrearCliente && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Nuevo Cliente</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarCrearCliente(false);
                      setNuevoCliente({ nombre: '', apellido: '', telefono: '' });
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="h-6 w-6" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Nombre *</label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                      value={nuevoCliente.nombre}
                      onChange={(e) => setNuevoCliente({...nuevoCliente, nombre: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Apellido *</label>
                    <input
                      type="text"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                      value={nuevoCliente.apellido}
                      onChange={(e) => setNuevoCliente({...nuevoCliente, apellido: e.target.value})}
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Teléfono</label>
                    <input
                      type="tel"
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                      value={nuevoCliente.telefono}
                      onChange={(e) => setNuevoCliente({...nuevoCliente, telefono: e.target.value})}
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMostrarCrearCliente(false);
                      setNuevoCliente({ nombre: '', apellido: '', telefono: '' });
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    disabled={creandoCliente}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCrearCliente}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    disabled={creandoCliente || !nuevoCliente.nombre.trim() || !nuevoCliente.apellido.trim()}
                  >
                    {creandoCliente ? 'Creando...' : 'Crear Cliente'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          {/* Selección de Recurso */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Recurso
            </label>
            <select 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
              value={recursoId || 0}
              onChange={(e) => setRecursoId(Number(e.target.value))}
              disabled={isSubmitting}
              required
            >
              <option value={0}>Seleccione un recurso</option>
              {Array.isArray(recursos) && recursos.length > 0 ? (
                recursos.filter(esRecursoDisponible).map((recurso) => (
                  <option key={recurso.id_recurso} value={recurso.id_recurso}>
                    {recurso.nombre} ({recurso.deporte || recurso.tipo_recurso})
                  </option>
                ))
              ) : (
                <option disabled>
                  {Array.isArray(recursos) && recursos.length > 0 
                    ? "Todos los recursos están en mantenimiento o no disponibles" 
                    : "No hay recursos registrados"}
                </option>
              )}
            </select>
          </div>
          
          {/* Fecha de reserva */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input 
                type="date"
                className="pl-10 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={fechaMinima}
                disabled={isSubmitting}
                required
              />
            </div>
          </div>
          
          {/* Horario (Inicio y Fin) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Hora de Inicio
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <ClockIcon className="h-5 w-5 text-gray-400" />
                </div>
                <select 
                  className="pl-10 mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                  disabled={isSubmitting}
                  required
                >
                  <option value="">Seleccione hora</option>
                  {generarHorarios().map((hora) => {
                    const normalizarHora = (h: string) => {
                      if (h?.includes(':')) {
                        const partes = h.split(':');
                        return `${partes[0]}:${partes[1]}`;
                      }
                      return h;
                    };

                    const estaOcupado = horariosOcupados.some(horario => {
                      const [inicioOcupado, finOcupado] = horario.split('-');
                      const inicioOcupadoNorm = normalizarHora(inicioOcupado);
                      const finOcupadoNorm = normalizarHora(finOcupado);
                      
                      const horaActual = parseInt(hora.split(':')[0]);
                      const horaInicioOcupado = parseInt(inicioOcupadoNorm.split(':')[0]);
                      let horaFinOcupado = parseInt(finOcupadoNorm.split(':')[0]);
                      
                      if (horaFinOcupado === 0) horaFinOcupado = 24;
                      
                      return horaActual >= horaInicioOcupado && horaActual < horaFinOcupado;
                    });

                    const horaYaPaso = (() => {
                      const ahora = new Date();
                      const fechaHoyBuenosAires = new Intl.DateTimeFormat('sv-SE', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                      }).format(ahora);
                      
                      if (fecha !== fechaHoyBuenosAires) return false;
                      
                      const horaActualBuenosAires = new Intl.DateTimeFormat('en-US', {
                        timeZone: 'America/Argentina/Buenos_Aires',
                        hour: 'numeric',
                        hour12: false
                      }).format(ahora);
                      
                      const horaActual = parseInt(horaActualBuenosAires);
                      const horaOpcion = parseInt(hora.split(':')[0]);
                      return horaOpcion <= horaActual;
                    })();

                    let className = '';
                    let textoAdicional = '';
                    let estaDeshabilitado = false;
                    
                    if (estaOcupado) {
                      className = 'text-red-500 bg-red-50';
                      textoAdicional = ' (Ocupado)';
                      estaDeshabilitado = true;
                    } else if (horaYaPaso) {
                      className = 'text-gray-400 bg-gray-50';
                      estaDeshabilitado = true;
                    }
                    
                    return (
                      <option 
                        key={hora} 
                        value={hora} 
                        disabled={estaDeshabilitado}
                        className={className}
                      >
                        {hora}{textoAdicional}
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duración
              </label>
              <select 
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"
                value={duracionMinutos}
                onChange={(e) => setDuracionMinutos(Number(e.target.value))}
                disabled={isSubmitting}
                required
              >
                {DURACIONES_VALIDAS_MINUTOS.map((minutos) => (
                  <option key={minutos} value={minutos}>{minutos} minutos</option>
                ))}
              </select>
              {horaInicio && (
                <p className="text-sm text-gray-500 mt-1">
                  Finaliza a las {horaFin}
                </p>
              )}
            </div>
          </div>
          
          {/* Estado de la reserva - Siempre pendiente para nuevas reservas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select 
              className="mt-1 block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm cursor-not-allowed"
              value="pendiente"
              disabled={true}
              required
            >
              <option value="pendiente">Pendiente</option>
            </select>
           
          </div>
        </div>
        
        {/* Resumen de la reserva: el costo definitivo se resuelve en el servidor según la tarifa vigente */}
        {recursoId && horaInicio && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">Resumen de la Reserva</h4>
            <div className="space-y-1 text-sm text-blue-800">
              <div className="flex justify-between">
                <span>Recurso:</span>
                <span>{recursos.find(r => r.id_recurso === recursoId)?.nombre}</span>
              </div>
              <div className="flex justify-between">
                <span>Horario:</span>
                <span>{horaInicio} - {horaFin}</span>
              </div>
              <div className="flex justify-between">
                <span>Duración:</span>
                <span>{duracionMinutos} minutos</span>
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-2">El costo se calculará automáticamente según la tarifa vigente para el cliente seleccionado.</p>
          </div>
        )}

        {/* Botones de acción */}
        <div className="mt-6 flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {reserva ? 'Actualizando...' : 'Creando...'}
              </span>
            ) : reserva ? 'Actualizar Reserva' : 'Crear Reserva'}
          </button>
        </div>
      </form>
    </div>
  );
}