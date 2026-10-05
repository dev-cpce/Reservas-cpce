'use client';

import { useEffect, useState } from 'react';
import { Cliente } from '@/types';
import {
  PencilIcon,
  TrashIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import DetallesClienteModal from './DetallesClienteModal';

interface ClientesListProps {
  clientes: Cliente[];
  onEdit: (cliente: Cliente) => void;
  onDelete: (id: number) => void;
  onSearch: (query: string) => void;
  puedeEditar: boolean;
  puedeEliminar: boolean;
}

export default function ClientesList({
  clientes,
  onEdit,
  onDelete,
  onSearch,
  puedeEditar,
  puedeEliminar
}: ClientesListProps) {
  const [clienteAEliminar, setClienteAEliminar] = useState<number | null>(
    null
  );

  const [clienteSeleccionado, setClienteSeleccionado] =
    useState<Cliente | null>(null);

  const [modalDetallesAbierto, setModalDetallesAbierto] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [isSearching, setIsSearching] = useState(false);

  const formatearFecha = (fechaISO?: string) => {
    if (!fechaISO) return 'No disponible';

    const fecha = new Date(fechaISO);

    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  /*
   * Buscar automáticamente mientras el usuario escribe.
   *
   * Se utiliza un pequeño debounce para no enviar una consulta
   * a Supabase por cada tecla inmediatamente.
   */
useEffect(() => {
  const termino = searchQuery.trim();

  if (termino === '') {
    return;
  }

  const timeout = setTimeout(() => {
    setIsSearching(true);
    onSearch(termino);
  }, 300);

  return () => {
    clearTimeout(timeout);
  };
}, [searchQuery, onSearch]);

  const handleClearSearch = () => {
    setSearchQuery('');
    setIsSearching(false);
    onSearch('');
  };

  const ConfirmDeleteDialog = ({
    id,
    nombre,
    apellido
  }: {
    id: number;
    nombre: string;
    apellido: string;
  }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
        <h3 className="text-lg font-medium mb-4">
          Confirmar eliminación
        </h3>

        <p className="text-gray-600 mb-6">
          ¿Estás seguro de que deseas eliminar el cliente{' '}
          <span className="font-semibold">
            {nombre} {apellido}
          </span>
          ? Esta acción no se puede deshacer.
        </p>

        <div className="flex justify-end space-x-3">
          <button
            onClick={() => setClienteAEliminar(null)}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
          >
            Cancelar
          </button>

          <button
            onClick={() => {
              onDelete(id);
              setClienteAEliminar(null);
            }}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Buscador */}
      <div className="mb-6 flex">
        <div className="relative flex-grow">
          <input
            type="text"
            className="w-full p-3 pl-10 pr-10 border border-gray-300 rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Buscar por nombre, apellido o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
            <MagnifyingGlassIcon className="h-5 w-5" />
          </span>

          {searchQuery && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-700"
              title="Limpiar búsqueda"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => onSearch(searchQuery.trim())}
          className="px-4 py-2 bg-blue-600 text-white border-r border-blue-700 hover:bg-blue-700"
        >
          Buscar
        </button>

        {isSearching && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="px-4 py-2 bg-gray-600 text-white rounded-r hover:bg-gray-700"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Estado de búsqueda sin resultados */}
      {clientes.length === 0 && isSearching && (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <MagnifyingGlassIcon className="h-10 w-10 mx-auto text-gray-400 mb-3" />

        <p className="text-gray-600 mb-4">
          No se encontró ninguna coincidencia para{' '}
          <span className="font-semibold">
            &quot;{searchQuery}&quot;
          </span>
          .
        </p>

          <button
            type="button"
            onClick={handleClearSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Volver a la lista completa
          </button>
        </div>
      )}

      {/* Sin clientes registrados */}
      {clientes.length === 0 && !isSearching && (
        <div className="text-center py-10 bg-white rounded-lg shadow">
          <p className="text-gray-600">
            No hay clientes registrados. Agrega un cliente para comenzar.
          </p>
        </div>
      )}

      {/* Tabla */}
      {clientes.length > 0 && (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  ID
                </th>

                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Nombre
                </th>

                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Apellido
                </th>

                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Teléfono
                </th>

                <th
                  scope="col"
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Registro
                </th>

                <th
                  scope="col"
                  className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  Acciones
                </th>
              </tr>
            </thead>

            <tbody className="bg-white divide-y divide-gray-200">
              {clientes.map((cliente) => (
                <tr
                  key={cliente.id_cliente}
                  className="hover:bg-gray-50"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {cliente.id_cliente}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cliente.nombre}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cliente.apellido}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {cliente.telefono}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatearFecha(cliente.fecha_registro)}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex justify-end space-x-3">
                      {/* Ver detalles - todos los roles */}
                      <button
                        onClick={() => {
                          setClienteSeleccionado(cliente);
                          setModalDetallesAbierto(true);
                        }}
                        className="text-gray-600 hover:text-gray-900"
                        title="Ver detalles"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>

                      {/* Editar - ADMIN y GERENCIA */}
                      {puedeEditar && (
                        <button
                          onClick={() => onEdit(cliente)}
                          className="text-blue-600 hover:text-blue-900"
                          title="Editar cliente"
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      )}

                      {/* Eliminar - ADMIN y GERENCIA */}
                      {puedeEliminar && (
                        <button
                          onClick={() =>
                            setClienteAEliminar(cliente.id_cliente)
                          }
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar cliente"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmación de eliminación */}
      {clienteAEliminar && (
        <ConfirmDeleteDialog
          id={clienteAEliminar}
          nombre={
            clientes.find(
              (c) => c.id_cliente === clienteAEliminar
            )?.nombre || 'el cliente seleccionado'
          }
          apellido={
            clientes.find(
              (c) => c.id_cliente === clienteAEliminar
            )?.apellido || ''
          }
        />
      )}

      {/* Modal de detalles */}
      <DetallesClienteModal
        cliente={clienteSeleccionado}
        isOpen={modalDetallesAbierto}
        onClose={() => {
          setModalDetallesAbierto(false);
          setClienteSeleccionado(null);
        }}
      />
    </>
  );
}