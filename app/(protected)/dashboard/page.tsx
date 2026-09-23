'use client';

import { useState, useEffect, useCallback } from 'react';
import { CalendarIcon, ClockIcon, UserGroupIcon, CurrencyDollarIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useDashboardRealtime } from '@/lib/useRealtime';
import { notifications } from '@/lib/notifications';
import {
  obtenerEstadisticasDashboardRecursos,
  obtenerReservasPorHorarioRecurso,
  obtenerReservasPorDiaSemana,
  obtenerDisponibilidadRecursosHoy,
  obtenerDisponibilidadSemanalRecurso,
} from '@/app/api/reservas/actions';
import StatCard from '@/components/StatCard';
import CourtOccupancyChart from '@/components/charts/CourtOccupancyChart';
import HourlyUsageChart from '@/components/charts/HourlyUsageChart';
import WeeklyBookingsChart from '@/components/charts/WeeklyBookingsChart';

import type { DashboardStats, ReservaPorHorario, ReservaPorDia, RecursoHorarioDisponible, DiaDisponibilidadRecurso } from '@/types/dashboard';

const formatearEstadoRecurso = (estado: string) => {
  switch (estado) {
    case 'DISPONIBLE': return 'Disponible';
    case 'MANTENIMIENTO': return 'Mantenimiento';
    case 'FUERA_SERVICIO': return 'Fuera de servicio';
    default: return estado;
  }
};

export default function DashboardPage() {
  const [statsData, setStatsData] = useState<DashboardStats>({
    reservasConfirmadas: 0,
    reservasPendientes: 0,
    ingresosDiarios: 0,
    ingresosMensuales: 0,
    recursosDisponibles: 0,
    totalRecursos: 0,
    totalReservasMensuales: 0,
    clientesActivos: 0
  });
  
  const [reservasPorHorario, setReservasPorHorario] = useState<ReservaPorHorario[]>([]);
  const [reservasPorDia, setReservasPorDia] = useState<ReservaPorDia[]>([]);

  const [disponibilidadRecursos, setDisponibilidadRecursos] = useState<RecursoHorarioDisponible[]>([]);
  const [fechaActual, setFechaActual] = useState<string>('');
  const [horaActual, setHoraActual] = useState<string>('');
  
  // Estados del modal de disponibilidad
  const [modalAbierto, setModalAbierto] = useState(false);
  const [recursoSeleccionado, setRecursoSeleccionado] = useState<RecursoHorarioDisponible | null>(null);
  const [reservasSemana, setReservasSemana] = useState<DiaDisponibilidadRecurso[]>([]);

  useEffect(() => {
    const actualizarFechaHora = () => {
      const ahora = new Date();
      setFechaActual(ahora.toLocaleDateString('es-AR'));
      setHoraActual(ahora.toLocaleTimeString('es-AR'));
    };

    actualizarFechaHora();
    const intervalo = setInterval(actualizarFechaHora, 1000);
    return () => clearInterval(intervalo);
  }, []);

  const cargarDatos = useCallback(async () => {
    try {
      const [estadisticas, datosPorHorario, datosPorDia, disponibilidadData] = await Promise.all([
        obtenerEstadisticasDashboardRecursos(),
        obtenerReservasPorHorarioRecurso(),
        obtenerReservasPorDiaSemana(),
        obtenerDisponibilidadRecursosHoy()
      ]);

      setStatsData(estadisticas);
      setReservasPorHorario(datosPorHorario);
      setReservasPorDia(datosPorDia);
      setDisponibilidadRecursos(disponibilidadData);
    } catch {
      notifications.error('Error al cargar los datos del dashboard');
    }
  }, []);

  const onReservaChange = useCallback(() => {
    setTimeout(cargarDatos, 100);
  }, [cargarDatos]);

  const onRecursoChange = useCallback(() => {
    setTimeout(cargarDatos, 100);
  }, [cargarDatos]);

  // Callback para cambios en pagos
  const onPagoChange = useCallback(() => {
    // Recargar estadísticas cuando hay cambios en pagos para actualizar ingresos
    setTimeout(cargarDatos, 500);
  }, [cargarDatos]);

  // Configurar suscripciones de Realtime
  useDashboardRealtime({
    onReservaChange,
    onRecursoChange,
    onPagoChange,
    enabled: true
  });

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Maneja click en tarjetas de recurso para abrir el modal de 7 días
  const manejarClickRecurso = async (recurso: RecursoHorarioDisponible) => {
    setRecursoSeleccionado(recurso);

    try {
      const disponibilidadSemana = await obtenerDisponibilidadSemanalRecurso(recurso.id_recurso);
      setReservasSemana(disponibilidadSemana);
      setModalAbierto(true);
    } catch {
      notifications.error('Error al cargar la disponibilidad del recurso');
    }
  };

  return (
    <div className="p-6">
      {/* Estadísticas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <StatCard 
          title="Reservas Confirmadas"
          value={statsData.reservasConfirmadas}
          description="Del día de hoy"
          icon={<CalendarIcon className="h-6 w-6" />}
        />
        
        <StatCard 
          title="Reservas Pendientes"
          value={statsData.reservasPendientes}
          description="Del día de hoy"
          icon={<ClockIcon className="h-6 w-6" />}
        />
        
        <StatCard 
          title="Clientes Activos"
          value={statsData.clientesActivos}
          description="Con reservas este mes"
          icon={<UserGroupIcon className="h-6 w-6" />}
        />
        
        <StatCard 
          title="Disponibilidad"
          value={`${statsData.recursosDisponibles}/${statsData.totalRecursos}`}
          description="Recursos disponibles"
          icon={<ClockIcon className="h-6 w-6" />}
        />
        
        <StatCard 
          title="Ingresos Diarios"
          value={`$${statsData.ingresosDiarios.toLocaleString()}`}
          description="Total de pagos aprobados hoy"
          icon={<CurrencyDollarIcon className="h-6 w-6" />}
        />
      </div>
      
      {/* Gráficos principales - Layout mejorado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-md p-6">
          <HourlyUsageChart data={reservasPorHorario} />
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <WeeklyBookingsChart data={reservasPorDia} />
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <CourtOccupancyChart 
            occupied={statsData.totalRecursos - statsData.recursosDisponibles} 
            available={statsData.recursosDisponibles} 
          />
        </div>
      </div>
      


      {/* Disponibilidad Completa de Horarios - TODOS LOS RECURSOS */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Estado de Recursos - [{fechaActual || 'Cargando...'}]</h3>
          <div className="text-sm text-gray-500">
            Actualización en tiempo real • {horaActual || 'Cargando...'}
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {disponibilidadRecursos.map((recurso) => (
            <div 
              key={recurso.id_recurso} 
              onClick={() => manejarClickRecurso(recurso)}
              className={`border-2 rounded-lg p-4 transition-all hover:shadow-lg cursor-pointer ${
                recurso.enMantenimiento 
                  ? 'border-orange-300 bg-orange-50 hover:bg-orange-100' 
                  : recurso.horariosDisponibles.length > 0 
                    ? 'border-green-300 bg-green-50 hover:bg-green-100' 
                    : 'border-red-300 bg-red-50 hover:bg-red-100'
              }`}
              title="Click para ver reservas de los próximos 7 días"
            >
              
              {/* Header del recurso */}
              <div className="flex justify-between items-start mb-3">
                <div className="font-semibold text-lg text-gray-900">{recurso.nombre}</div>
                <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                  recurso.enMantenimiento 
                    ? 'bg-orange-200 text-orange-800' 
                    : 'bg-green-200 text-green-800'
                }`}>
                  {formatearEstadoRecurso(recurso.estado)}
                </div>
              </div>
              
              {/* Info básica */}
              <div className="text-sm text-gray-600 mb-4 space-y-1">
                <div><span className="font-medium">Tipo:</span> {recurso.tipo_recurso}</div>
                {recurso.deporte && (
                  <div><span className="font-medium">Deporte:</span> {recurso.deporte}</div>
                )}
                {recurso.capacidad != null && (
                  <div><span className="font-medium">Capacidad:</span> {recurso.capacidad}</div>
                )}
                <div>
                  <span className="font-medium">Horario:</span>{' '}
                  {recurso.horaApertura && recurso.horaCierre
                    ? `${recurso.horaApertura.substring(0, 5)} - ${recurso.horaCierre.substring(0, 5)}`
                    : 'Sin horario configurado para hoy'}
                </div>
              </div>
              
              {recurso.enMantenimiento ? (
                /* Recurso en mantenimiento o fuera de servicio */
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">🔧</div>
                  <div className="text-sm font-medium text-orange-700 mb-1">Recurso no disponible</div>
                  <div className="text-xs text-orange-600">No disponible para reservas hoy</div>
                </div>
              ) : !recurso.horaApertura ? (
                <div className="text-center py-6">
                  <div className="text-3xl mb-2">📅</div>
                  <div className="text-sm font-medium text-gray-600">Sin horario configurado para hoy</div>
                </div>
              ) : (
                <>
                  {/* Horarios Disponibles */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-700">
                        Disponibles ({recurso.horariosDisponibles.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 min-h-[24px]">
                      {recurso.horariosDisponibles.length > 0 ? (
                        recurso.horariosDisponibles.map((horario, index) => (
                          <span key={index} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-md font-medium border border-green-200 hover:bg-green-200 transition-colors cursor-pointer" title="Disponible para reservar">
                            {horario}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-500 italic py-1">Todos los horarios ocupados o pasados</span>
                      )}
                    </div>
                  </div>

                  {/* Horarios Ocupados */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-red-700">
                        Reservados ({recurso.horariosOcupados.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 min-h-[24px]">
                      {recurso.horariosOcupados.length > 0 ? (
                        recurso.horariosOcupados.map((horario, index) => (
                          <span key={index} className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-md border border-red-200" title="Ocupado por reserva o bloqueo">
                            {horario}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-green-600 font-medium py-1">Sin reservas hoy</span>
                      )}
                    </div>
                  </div>


                </>
              )}
              
              {/* Resumen final */}
              <div className="mt-4 pt-3 border-t border-gray-200">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-green-100 rounded p-1">
                    <div className="font-bold text-green-800">{recurso.horariosDisponibles?.length || 0}</div>
                    <div className="text-green-600">Libres</div>
                  </div>
                  <div className="bg-red-100 rounded p-1">
                    <div className="font-bold text-red-800">{recurso.horariosOcupados?.length || 0}</div>
                    <div className="text-red-600">Ocupados</div>
                  </div>
                  <div className="bg-gray-100 rounded p-1">
                    <div className="font-bold text-gray-700">{recurso.totalHorariosHoy || 0}</div>
                    <div className="text-gray-600">Total</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {disponibilidadRecursos.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-4">🏟️</div>
            <div className="text-lg font-semibold mb-2">No hay recursos configurados</div>
            <div className="text-sm">Agrega recursos al sistema para ver su disponibilidad</div>
          </div>
        )}
        
        {/* Leyenda */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="text-sm text-gray-600 mb-2 font-medium">Leyenda:</div>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-green-100 border border-green-200 rounded"></span>
              <span>Disponible para reservar</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-red-100 border border-red-200 rounded"></span>
              <span>Ocupado por reserva o bloqueo</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></span>
              <span>Recurso en mantenimiento</span>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Vista Semanal */}
      {modalAbierto && recursoSeleccionado && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-auto">
            {/* Header del modal */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {recursoSeleccionado.nombre} - Reservas de los próximos 7 días
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Tipo: {recursoSeleccionado.tipo_recurso}{recursoSeleccionado.deporte ? ` • Deporte: ${recursoSeleccionado.deporte}` : ''}
                </p>
              </div>
              <button
                onClick={() => setModalAbierto(false)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title="Cerrar"
              >
                <XMarkIcon className="h-5 w-5 text-gray-400" />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="p-6">
              <div className="grid gap-4">
                {reservasSemana.map((dia, index) => {
                  // Crear fecha correctamente desde string YYYY-MM-DD
                  const [year, month, day] = dia.fecha.split('-').map(Number);
                  const fecha = new Date(year, month - 1, day); // month es 0-indexed
                  const esHoy = index === 0;
                  const nombreDia = fecha.toLocaleDateString('es-AR', { weekday: 'long' });
                  const fechaFormateada = fecha.toLocaleDateString('es-AR', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric' 
                  });

                  const slotsDelDia = [...dia.horariosDisponibles, ...dia.horariosOcupados].sort();

                  return (
                    <div 
                      key={dia.fecha} 
                      className={`border rounded-lg p-4 ${
                        esHoy ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-gray-900 capitalize">
                          {nombreDia} - {fechaFormateada}
                          {esHoy && <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">HOY</span>}
                        </h3>
                        <div className="text-sm text-gray-600">
                          {dia.horaApertura && dia.horaCierre
                            ? `${dia.horaApertura.substring(0, 5)} - ${dia.horaCierre.substring(0, 5)} • `
                            : ''}
                          {dia.horariosDisponibles.length} libres • {dia.horariosOcupados.length} ocupados
                        </div>
                      </div>

                      {/* Grid de horarios */}
                      {slotsDelDia.length > 0 ? (
                        <div className="grid grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1">
                          {slotsDelDia.map((horarioStr) => {
                            const estaDisponible = dia.horariosDisponibles.includes(horarioStr);
                            const estaOcupado = dia.horariosOcupados.includes(horarioStr);

                            return (
                              <div
                                key={horarioStr}
                                className={`text-xs px-2 py-1 rounded text-center font-medium transition-colors ${
                                  estaOcupado
                                    ? 'bg-red-500 text-white border-2 border-red-600 shadow-md'
                                    : estaDisponible
                                    ? 'bg-green-100 text-green-800 border border-green-200'
                                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                                }`}
                                title={estaOcupado ? `Ocupado - ${horarioStr}` : `Disponible - ${horarioStr}`}
                              >
                                {horarioStr}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-500 italic py-2">Sin horario configurado para este día</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Leyenda del modal */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600 mb-2 font-medium">Leyenda:</div>
                <div className="flex flex-wrap gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-green-100 border border-green-200 rounded"></span>
                    <span>Disponible</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-3 h-3 bg-red-500 border-2 border-red-600 rounded"></span>
                    <span className="font-medium">Ocupado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
