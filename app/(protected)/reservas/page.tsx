'use client';

import { useState, useEffect, useCallback } from 'react';
import { Reserva, Cliente, Recurso, NuevaReservaRecursoInput } from '@/types';
import { PlusIcon } from '@heroicons/react/24/outline';
import ReservaForm from '@/components/reservas/ReservaForm';
import ReservasList from '@/components/reservas/ReservasList';
import notifications from '@/lib/notifications';
import { useRealtimeReservas } from '@/lib/useRealtime';

// Importar las acciones del servidor
import { 
  obtenerReservas,
  crearReservaRecurso,
  actualizarReservaRecurso,
  eliminarReserva,
  cambiarEstadoReserva,

  obtenerClientesActivos,
  obtenerRecursosDisponibles,
} from '@/app/api/reservas/actions';

export default function ReservasPage() {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [reservaEditando, setReservaEditando] = useState<Reserva | undefined>(undefined);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [recursos, setRecursos] = useState<Recurso[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Cargar datos al inicio
  const cargarDatos = useCallback(async () => {
      setErrorMessage('');
      
      try {
        // Cargar los clientes activos, reservas y recursos
        const [clientesData, reservasData, recursosData] = await Promise.all([
          obtenerClientesActivos().catch(error => {
                        setErrorMessage('Error al cargar clientes: ' + error.message);
            return [];
          }),
          obtenerReservas().catch(error => {
                        setErrorMessage('Error al cargar reservas: ' + error.message);
            return [];
          }),
          obtenerRecursosDisponibles().catch(error => {
                        setErrorMessage('Error al cargar recursos: ' + error.message);
            return [];
          })
        ]);

        setClientes(clientesData);
        setReservas(reservasData);
        setRecursos(recursosData);
        

      } catch (error) {
        setErrorMessage('Error al cargar los datos: ' + (error as Error).message);
      }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Refresca la lista ante cualquier INSERT/UPDATE/DELETE en `reserva` (incluye
  // cambios externos a esta página, como la cancelación automática por vencimiento).
  useRealtimeReservas(useCallback(() => {
    setTimeout(cargarDatos, 100);
  }, [cargarDatos]));

  const handleSubmitReserva = async (datos: NuevaReservaRecursoInput) => {
    try {
      setErrorMessage('');
      
      if (reservaEditando) {
        await actualizarReservaRecurso(reservaEditando.id_reserva, datos);
      } else {
        await crearReservaRecurso(datos);
      }
      const nuevasReservas = await obtenerReservas();
      setReservas(nuevasReservas);
      
      setMostrarFormulario(false);
      setReservaEditando(undefined);
    } catch (error) {
            setErrorMessage((error as Error).message || 'Error al procesar la reserva');
            notifications.error(reservaEditando ? 'Error al actualizar la reserva' : 'Error al crear la reserva');
    }
  };

  // Manejar creación de nuevo cliente
  const handleClienteCreado = (nuevoCliente: Cliente) => {
    // Agregar el nuevo cliente a la lista existente
    setClientes(prevClientes => [...prevClientes, nuevoCliente]);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        {!mostrarFormulario && (
          <button
            onClick={() => setMostrarFormulario(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Nueva Reserva
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
          <p>{errorMessage}</p>
        </div>
      )}

      {mostrarFormulario ? (
        <ReservaForm
          reserva={reservaEditando}
          clientes={clientes}
          recursos={recursos}
          onSubmit={handleSubmitReserva}
          isSubmitting={false}
          onClienteCreado={handleClienteCreado}
          onCancel={() => {
            setReservaEditando(undefined);
            setMostrarFormulario(false);
          }}
        />
      ) : (
        <ReservasList
          reservas={reservas}
          onEdit={(reserva) => {
            setReservaEditando(reserva);
            setMostrarFormulario(true);
          }}
          onDelete={async (id) => {
            try {
              await eliminarReserva(id);
              const nuevasReservas = await obtenerReservas();
              setReservas(nuevasReservas);
            } catch {
                            setErrorMessage('Error al eliminar la reserva');
                            notifications.error('Error al eliminar la reserva');
            }
          }}

          onCambiarEstado={async (id: number, estado: string) => {
            try {
              await cambiarEstadoReserva(id, estado);
              const nuevasReservas = await obtenerReservas();
              setReservas(nuevasReservas);
            } catch {
                            setErrorMessage('Error al cambiar el estado de la reserva');
                            notifications.error('Error al cambiar el estado');
            }
          }}
        />
      )}
    </div>
  );
}
