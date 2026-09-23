'use client';

import { useState, useEffect, useCallback } from 'react';
import { RecursoBloqueo, Recurso } from '@/types';
import { PlusIcon } from '@heroicons/react/24/outline';
import BloqueoForm from '@/components/bloqueos/BloqueoForm';
import BloqueosList from '@/components/bloqueos/BloqueosList';
import notifications from '@/lib/notifications';

// Importar las acciones del servidor
import {
  obtenerBloqueos,
  crearBloqueo,
  actualizarBloqueo,
  eliminarBloqueo,
  cambiarEstadoBloqueo
} from '@/app/api/recurso-bloqueo/actions';
import { obtenerRecursosDisponibles } from '@/app/api/reservas/actions';

export default function BloqueosPage() {
    const [bloqueos, setBloqueos] = useState<RecursoBloqueo[]>([]);
    const [recursos, setRecursos] = useState<Recurso[]>([]);
    const [bloqueoEditando, setBloqueoEditando] = useState<RecursoBloqueo | undefined>(undefined);
    const [mostrarFormulario, setMostrarFormulario] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Cargar datos de bloqueos y recursos
    const cargarDatos = useCallback(async () => {
        try {
            const [bloqueosData, recursosData] = await Promise.all([
                obtenerBloqueos(),
                obtenerRecursosDisponibles().catch(() => [])
            ]);
            setBloqueos(bloqueosData);
            setRecursos(recursosData);
        } catch {
            setErrorMessage('Error al cargar los bloqueos. Intenta nuevamente.');
        }
    }, []);

    useEffect(() => {
        cargarDatos();
    }, [cargarDatos]);

    // Manejar creación de bloqueo
    const handleCrearBloqueo = async (bloqueo: Omit<RecursoBloqueo, 'id_bloqueo' | 'created_at'>) => {
        setIsLoading(true);
        setErrorMessage('');

        try {
            const nuevoBloqueo = await crearBloqueo(bloqueo);
            if (nuevoBloqueo) {
                setBloqueos(prev => [nuevoBloqueo, ...prev]);
            }
            setMostrarFormulario(false);
        } catch {
            setErrorMessage('Error al crear el bloqueo. Intenta nuevamente.');
            notifications.error('Error al crear el bloqueo');
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar actualización de bloqueo
    const handleActualizarBloqueo = async (bloqueo: Omit<RecursoBloqueo, 'id_bloqueo' | 'created_at'>) => {
        if (!bloqueoEditando) return;

        setIsLoading(true);
        setErrorMessage('');

        try {
            const bloqueoActualizado = await actualizarBloqueo(bloqueoEditando.id_bloqueo, bloqueo);
            if (bloqueoActualizado) {
                setBloqueos(prev => prev.map(item => item.id_bloqueo === bloqueoEditando.id_bloqueo ? bloqueoActualizado : item));
            }
            setBloqueoEditando(undefined);
            setMostrarFormulario(false);
        } catch {
            setErrorMessage('Error al actualizar el bloqueo. Intenta nuevamente.');
            notifications.error('Error al actualizar el bloqueo');
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar eliminación de bloqueo
    const handleEliminarBloqueo = async (id: number) => {
        setIsLoading(true);
        setErrorMessage('');

        try {
            await eliminarBloqueo(id);
            setBloqueos(prev => prev.filter(bloqueo => bloqueo.id_bloqueo !== id));
        } catch {
            setErrorMessage('Error al eliminar el bloqueo. Intenta nuevamente.');
            notifications.error('Error al eliminar el bloqueo');
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar cambio de estado
    const handleCambiarEstado = async (id: number, activo: boolean) => {
        setIsLoading(true);
        setErrorMessage('');

        try {
            const bloqueoActualizado = await cambiarEstadoBloqueo(id, activo);
            if (bloqueoActualizado) {
                setBloqueos(prev => prev.map(item => item.id_bloqueo === id ? bloqueoActualizado : item));
            }
        } catch {
            setErrorMessage('Error al cambiar el estado del bloqueo. Intenta nuevamente.');
            notifications.error('Error al cambiar el estado');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditarBloqueo = (bloqueo: RecursoBloqueo) => {
        setBloqueoEditando(bloqueo);
        setMostrarFormulario(true);
    };

    const handleCerrarFormulario = () => {
        setBloqueoEditando(undefined);
        setMostrarFormulario(false);
    };

    const handleSubmitFormulario = async (data: Omit<RecursoBloqueo, 'id_bloqueo' | 'created_at'>) => {
        if (bloqueoEditando) {
            await handleActualizarBloqueo(data);
        } else {
            await handleCrearBloqueo(data);
        }
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
                        Nuevo Bloqueo
                    </button>
                )}
            </div>

            {errorMessage && (
                <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700">
                    <p>{errorMessage}</p>
                </div>
            )}

            {isLoading && !mostrarFormulario && (
                <div className="flex justify-center items-center py-12">
                    <div className="flex flex-col items-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                        <p className="mt-4 text-gray-700">Cargando bloqueos...</p>
                    </div>
                </div>
            )}

            {mostrarFormulario ? (
                <BloqueoForm
                    bloqueo={bloqueoEditando}
                    recursos={recursos}
                    onSubmit={handleSubmitFormulario}
                    isSubmitting={isLoading}
                    onCancel={handleCerrarFormulario}
                />
            ) : !isLoading && (
                <BloqueosList
                    bloqueos={bloqueos}
                    recursos={recursos}
                    onEdit={handleEditarBloqueo}
                    onDelete={handleEliminarBloqueo}
                    onChangeStatus={handleCambiarEstado}
                />
            )}
        </div>
    );
}
