'use client';

import { useState } from 'react';
import { Recurso } from '@/types';
import {
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/outline';

interface RecursosListProps {
  recursos: Recurso[];
  onEdit: (recurso: Recurso) => void;
  onDelete: (id: number) => void;
  onChangeStatus: (id: number, activo: boolean) => void;
}

export default function RecursosList({
  recursos,
  onEdit,
  onDelete,
  onChangeStatus
}: RecursosListProps) {
  const [recursoAEliminar, setRecursoAEliminar] = useState<number | null>(null);

  // Función para obtener color según estado operativo
  const getEstadoColor = (estado: Recurso['estado']) => {
    switch (estado) {
      case 'DISPONIBLE': return 'bg-green-100 text-green-800';
      case 'MANTENIMIENTO': return 'bg-yellow-100 text-yellow-800';
      case 'FUERA_SERVICIO': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Función para obtener ícono según estado operativo
  const getEstadoIcon = (estado: Recurso['estado']) => {
    switch (estado) {
      case 'DISPONIBLE': return <CheckCircleIcon className="h-5 w-5" />;
      case 'MANTENIMIENTO': return <ExclamationCircleIcon className="h-5 w-5" />;
      case 'FUERA_SERVICIO': return <XCircleIcon className="h-5 w-5" />;
      default: return null;
    }
  };

  const formatearEstado = (estado: Recurso['estado']) => {
    switch (estado) {
      case 'DISPONIBLE': return 'Disponible';
      case 'MANTENIMIENTO': return 'Mantenimiento';
      case 'FUERA_SERVICIO': return 'Fuera de servicio';
      default: return estado;
    }
  };

  // Diálogo de confirmación para eliminar recurso
  const ConfirmDeleteDialog = ({ id, nombre }: { id: number; nombre: string }) => (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full">
        <h3 className="text-lg font-medium mb-4">Confirmar eliminación</h3>
        <p className="text-gray-600 mb-6">
          ¿Estás seguro de que deseas eliminar el recurso <span className="font-semibold">{nombre}</span>? Esta acción no se puede deshacer.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setRecursoAEliminar(null)}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onDelete(id);
              setRecursoAEliminar(null);
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );

  if (recursos.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-lg shadow">
        <p className="text-gray-600">No hay recursos registrados. Agrega un recurso para comenzar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Deporte</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacidad</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descripción</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {recursos.map((recurso) => (
            <tr key={recurso.id_recurso}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {recurso.nombre}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {recurso.tipo_recurso}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {recurso.deporte || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {recurso.capacidad ?? '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getEstadoColor(recurso.estado)}`}>
                  <span className="mr-1">
                    {getEstadoIcon(recurso.estado)}
                  </span>
                  {formatearEstado(recurso.estado)}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  recurso.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {recurso.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                {recurso.descripcion || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-3">
                  {/* Activar/desactivar */}
                  <button
                    onClick={() => onChangeStatus(recurso.id_recurso, !recurso.activo)}
                    className="text-gray-600 hover:text-gray-900"
                    title={recurso.activo ? 'Desactivar recurso' : 'Activar recurso'}
                  >
                    {recurso.activo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => onEdit(recurso)}
                    className="text-blue-600 hover:text-blue-900"
                    title="Editar recurso"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>

                  {/* Eliminar */}
                  <button
                    onClick={() => setRecursoAEliminar(recurso.id_recurso)}
                    className="text-red-600 hover:text-red-900"
                    title="Eliminar recurso"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {recursoAEliminar && (
        <ConfirmDeleteDialog
          id={recursoAEliminar}
          nombre={recursos.find(r => r.id_recurso === recursoAEliminar)?.nombre || 'el recurso seleccionado'}
        />
      )}
    </div>
  );
}
