'use client';

import { useState, useEffect, useCallback } from 'react';
import { Recurso } from '@/types';
import { PlusIcon } from '@heroicons/react/24/outline';
import RecursoForm from '@/components/recursos/RecursoForm';
import RecursosList from '@/components/recursos/RecursosList';
import notifications from '@/lib/notifications';

// Importar las acciones del servidor
import {
    obtenerRecursos,
    crearRecurso,
    actualizarRecurso,
    eliminarRecurso,
    cambiarEstadoRecurso
} from '@/app/api/recursos/actions';

export default function RecursosPage() {
    const [recursos, setRecursos] = useState<Recurso[]>([]);
    const [recursoEditando, setRecursoEditando] = useState<Recurso | undefined>(undefined);
    const [mostrarFormulario, setMostrarFormulario] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Cargar datos de recursos
    const cargarRecursos = useCallback(async () => {
        try {
            const data = await obtenerRecursos();
            setRecursos(data);
        } catch {
            setErrorMessage('Error al cargar los recursos. Intenta nuevamente.');
        }
    }, []);

    useEffect(() => {
        cargarRecursos();
    }, [cargarRecursos]);

    // Manejar creación de recurso
    const handleCrearRecurso = async (recurso: Omit<Recurso, 'id_recurso' | 'created_at' | 'updated_at'>) => {
        setIsLoading(true);
        setErrorMessage('');

        try {
            const nuevoRecurso = await crearRecurso(recurso);
            if (nuevoRecurso) {
                setRecursos(prev => [...prev, nuevoRecurso]);
            }
            setMostrarFormulario(false);
        } catch {
            setErrorMessage('Error al crear el recurso. Intenta nuevamente.');
            notifications.error('Error al crear el recurso');
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar actualización de recurso
    const handleActualizarRecurso = async (recurso: Omit<Recurso, 'id_recurso' | 'created_at' | 'updated_at'>) => {
        if (!recursoEditando) return;

        setIsLoading(true);
        setErrorMessage('');

        try {
            const recursoActualizado = await actualizarRecurso(recursoEditando.id_recurso, recurso);
            if (recursoActualizado) {
                setRecursos(prev => prev.map(item => item.id_recurso === recursoEditando.id_recurso ? recursoActualizado : item));
            }
            setRecursoEditando(undefined);
            setMostrarFormulario(false);
        } catch {
            setErrorMessage('Error al actualizar el recurso. Intenta nuevamente.');
            notifications.error('Error al actualizar el recurso');
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar eliminación de recurso
    const handleEliminarRecurso = async (id: number) => {
        setIsLoading(true);
        setErrorMessage('');

        try {
            await eliminarRecurso(id);
            setRecursos(prev => prev.filter(recurso => recurso.id_recurso !== id));
        } catch {
            setErrorMessage('Error al eliminar el recurso. Intenta nuevamente.');
            notifications.error('Error al eliminar el recurso');
        } finally {
            setIsLoading(false);
        }
    };

    // Manejar cambio de estado (activo/inactivo)
    const handleCambiarEstado = async (id: number, activo: boolean) => {
        setIsLoading(true);
        setErrorMessage('');

        try {
            const recursoActualizado = await cambiarEstadoRecurso(id, activo);
            if (recursoActualizado) {
                setRecursos(prev => prev.map(item => item.id_recurso === id ? recursoActualizado : item));
            }
        } catch {
            setErrorMessage('Error al cambiar el estado del recurso. Intenta nuevamente.');
            notifications.error('Error al cambiar el estado');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEditarRecurso = (recurso: Recurso) => {
        setRecursoEditando(recurso);
        setMostrarFormulario(true);
    };

    const handleCerrarFormulario = () => {
        setRecursoEditando(undefined);
        setMostrarFormulario(false);
    };

    const handleSubmitFormulario = async (data: Omit<Recurso, 'id_recurso' | 'created_at' | 'updated_at'>) => {
        if (recursoEditando) {
            await handleActualizarRecurso(data);
        } else {
            await handleCrearRecurso(data);
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
                        Nuevo Recurso
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
                        <p className="mt-4 text-gray-700">Cargando recursos...</p>
                    </div>
                </div>
            )}

            {mostrarFormulario ? (
                <RecursoForm
                    recurso={recursoEditando}
                    onSubmit={handleSubmitFormulario}
                    isSubmitting={isLoading}
                    onCancel={handleCerrarFormulario}
                />
            ) : !isLoading && (
                <RecursosList
                    recursos={recursos}
                    onEdit={handleEditarRecurso}
                    onDelete={handleEliminarRecurso}
                    onChangeStatus={handleCambiarEstado}
                />
            )}
        </div>
    );
}
