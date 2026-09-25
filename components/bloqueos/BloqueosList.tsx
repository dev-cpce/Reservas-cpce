'use client';

import { useState } from 'react';
import { RecursoBloqueo, Recurso } from '@/types';
import {
  PencilIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';

interface BloqueosListProps {
  bloqueos: RecursoBloqueo[];
  recursos: Recurso[];
  onEdit: (bloqueo: RecursoBloqueo) => void;
  onDelete: (id: number) => void;
  onChangeStatus: (id: number, activo: boolean) => void;
}

export default function BloqueosList({
  bloqueos,
  recursos,
  onEdit,
  onDelete,
  onChangeStatus
}: BloqueosListProps) {
  const [bloqueoAEliminar, setBloqueoAEliminar] = useState<number | null>(null);

  const nombreRecurso = (idRecurso: number) =>
    recursos.find(r => r.id_recurso === idRecurso)?.nombre || `Recurso ${idRecurso}`;

  const formatearHora = (hora: string) => hora?.substring(0, 5) || '';

  if (bloqueos.length === 0) {
    return (
      <div className="text-center py-10 bg-white rounded-lg shadow">
        <p className="text-gray-600">No hay bloqueos registrados. Agrega un bloqueo para comenzar.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recurso</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora Inicio</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora Fin</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Motivo</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {bloqueos.map((bloqueo) => (
            <tr key={bloqueo.id_bloqueo}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {nombreRecurso(bloqueo.id_recurso)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {bloqueo.fecha}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatearHora(bloqueo.hora_inicio)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {formatearHora(bloqueo.hora_fin)}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {bloqueo.motivo || '-'}
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  bloqueo.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  <span className="mr-1">
                    {bloqueo.activo ? <CheckCircleIcon className="h-4 w-4" /> : <XCircleIcon className="h-4 w-4" />}
                  </span>
                  {bloqueo.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <div className="flex justify-end space-x-3">
                  {/* Activar/desactivar */}
                  <button
                    onClick={() => onChangeStatus(bloqueo.id_bloqueo, !bloqueo.activo)}
                    className="text-gray-600 hover:text-gray-900"
                    title={bloqueo.activo ? 'Desactivar bloqueo' : 'Activar bloqueo'}
                  >
                    {bloqueo.activo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                  </button>

                  {/* Editar */}
                  <button
                    onClick={() => onEdit(bloqueo)}
                    className="text-blue-600 hover:text-blue-900"
                    title="Editar bloqueo"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

    </div>
  );
}
