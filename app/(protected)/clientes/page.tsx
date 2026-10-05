'use client';

import { useState, useEffect, useCallback } from 'react';
import { Cliente } from '@/types';
import { PlusIcon } from '@heroicons/react/24/outline';
import ClienteForm from '@/components/clientes/ClienteForm';
import ClientesList from '@/components/clientes/ClientesList';
import notifications from '@/lib/notifications';

// Importar las acciones del servidor
import {
  obtenerClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
  buscarClientes,
  obtenerPermisosClientes
} from '@/app/api/clientes/actions';

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteEditando, setClienteEditando] = useState<
    Cliente | undefined
  >(undefined);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [permisos, setPermisos] = useState({
    puedeCrear: false,
    puedeEditar: false,
    puedeEliminar: false
  });

  // Cargar datos de clientes
  const cargarClientes = useCallback(async () => {
    try {
      const data = await obtenerClientes();
      setClientes(data);
    } catch {
      setErrorMessage(
        'Error al cargar los clientes. Intenta nuevamente.'
      );
    }
  }, []);

  // Cargar permisos del usuario
  const cargarPermisos = useCallback(async () => {
    try {
      const permisosClientes = await obtenerPermisosClientes();

      setPermisos(permisosClientes);
    } catch {
      setPermisos({
        puedeCrear: false,
        puedeEditar: false,
        puedeEliminar: false
      });
    }
  }, []);

  useEffect(() => {
    cargarClientes();
    cargarPermisos();
  }, [cargarClientes, cargarPermisos]);

  // Manejar creación de cliente
  const handleCrearCliente = async (
    cliente: Omit<Cliente, 'id_cliente' | 'fecha_registro'>
  ) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const nuevoCliente = await crearCliente(cliente);

      if (nuevoCliente) {
        setClientes((prev) => [...prev, nuevoCliente]);
      }

      setMostrarFormulario(false);
    } catch {
      setErrorMessage(
        'Error al crear el cliente. Intenta nuevamente.'
      );
      notifications.error('Error al crear el cliente');
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar actualización de cliente
  const handleActualizarCliente = async (
    cliente: Omit<Cliente, 'id_cliente' | 'fecha_registro'>
  ) => {
    if (!clienteEditando) return;

    setIsLoading(true);
    setErrorMessage('');

    try {
      const clienteActualizado = await actualizarCliente(
        clienteEditando.id_cliente,
        cliente
      );

      if (clienteActualizado) {
        setClientes((prev) =>
          prev.map((item) =>
            item.id_cliente === clienteEditando.id_cliente
              ? clienteActualizado
              : item
          )
        );
      }

      setClienteEditando(undefined);
      setMostrarFormulario(false);
    } catch {
      setErrorMessage(
        'Error al actualizar el cliente. Intenta nuevamente.'
      );
      notifications.error('Error al actualizar el cliente');
    } finally {
      setIsLoading(false);
    }
  };

  // Manejar eliminación de cliente
  const handleEliminarCliente = async (id: number) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      await eliminarCliente(id);

      setClientes((prev) =>
        prev.filter((cliente) => cliente.id_cliente !== id)
      );
    } catch {
      setErrorMessage(
        'Error al eliminar el cliente. Intenta nuevamente.'
      );
      notifications.error('Error al eliminar el cliente');
    } finally {
      setIsLoading(false);
    }
  };

  // Función para buscar clientes
const handleBuscarClientes = useCallback(
  async (query: string) => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      if (query.trim() === '') {
        await cargarClientes();
      } else {
        const resultados = await buscarClientes(query);
        setClientes(resultados);
      }
    } catch {
      setErrorMessage(
        'Error al buscar clientes. Intenta nuevamente.'
      );
    } finally {
      setIsLoading(false);
    }
  },
  [cargarClientes]
);

  const handleEditarCliente = (cliente: Cliente) => {
    setClienteEditando(cliente);
    setMostrarFormulario(true);
  };

  const handleCerrarFormulario = () => {
    setClienteEditando(undefined);
    setMostrarFormulario(false);
  };

  const handleSubmitFormulario = async (
    data: Omit<Cliente, 'id_cliente' | 'fecha_registro'>
  ) => {
    if (clienteEditando) {
      await handleActualizarCliente(data);
    } else {
      await handleCrearCliente(data);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex justify-between items-center mb-6">
        {!mostrarFormulario && permisos.puedeCrear && (
          <button
            onClick={() => setMostrarFormulario(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            Nuevo Cliente
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
            <p className="mt-4 text-gray-700">
              Cargando clientes...
            </p>
          </div>
        </div>
      )}

      {mostrarFormulario ? (
        <ClienteForm
          cliente={clienteEditando}
          onSubmit={handleSubmitFormulario}
          isSubmitting={isLoading}
          onCancel={handleCerrarFormulario}
        />
      ) : (
        !isLoading && (
          <ClientesList
            clientes={clientes}
            onEdit={handleEditarCliente}
            onDelete={handleEliminarCliente}
            onSearch={handleBuscarClientes}
            puedeEditar={permisos.puedeEditar}
            puedeEliminar={permisos.puedeEliminar}
          />
        )
      )}
    </div>
  );
}

