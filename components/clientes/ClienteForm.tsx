'use client';

import { useState } from 'react';
import { Cliente } from '@/types';

interface ClienteFormProps {
  cliente?: Cliente;
  onSubmit: (data: Omit<Cliente, 'id_cliente' | 'fecha_registro'>) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}

export default function ClienteForm({ 
  cliente, 
  onSubmit, 
  isSubmitting, 
  onCancel 
}: ClienteFormProps) {
  const [nombre, setNombre] = useState(cliente?.nombre || '');
  const [apellido, setApellido] = useState(cliente?.apellido || '');
  const [telefono, setTelefono] = useState(cliente?.telefono || '');
  // Clientes existentes sin tipo_cliente (NULL) se muestran como NO_SOCIO por defecto.
  const [tipoCliente, setTipoCliente] = useState<'SOCIO' | 'NO_SOCIO'>(cliente?.tipo_cliente || 'NO_SOCIO');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validación básica
    if (!nombre.trim() || !apellido.trim() || !telefono.trim()) {
      setError('Todos los campos son obligatorios.');
      return;
    }
    
    // Validar formato de teléfono (solo números y algunos caracteres especiales)
    const telefonoRegex = /^[0-9+()\-\s]*$/;
    if (!telefonoRegex.test(telefono)) {
      setError('El formato del teléfono no es válido.');
      return;
    }
    
    try {
      await onSubmit({
        nombre,
        apellido,
        telefono,
        tipo_cliente: tipoCliente
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ha ocurrido un error al guardar el cliente');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      <h2 className="text-xl font-bold mb-6">
        {cliente ? 'Editar Cliente' : 'Nuevo Cliente'}
      </h2>
      
      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border-l-4 border-red-500 rounded">
          {error}
        </div>
      )}
      
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="nombre" className="block mb-2 text-sm font-medium text-gray-700">
            Nombre
          </label>
          <input
            type="text"
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="apellido" className="block mb-2 text-sm font-medium text-gray-700">
            Apellido
          </label>
          <input
            type="text"
            id="apellido"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="telefono" className="block mb-2 text-sm font-medium text-gray-700">
            Teléfono
          </label>
          <input
            type="text"
            id="telefono"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="+54 (11) 1234-5678"
            required
          />
        </div>
        
        <div className="mb-4">
          <label htmlFor="tipo_cliente" className="block mb-2 text-sm font-medium text-gray-700">
            Tipo de cliente
          </label>
          <select
            id="tipo_cliente"
            value={tipoCliente}
            onChange={(e) => setTipoCliente(e.target.value as 'SOCIO' | 'NO_SOCIO')}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="SOCIO">Socio</option>
            <option value="NO_SOCIO">No socio</option>
          </select>
        </div>
        
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100"
            disabled={isSubmitting}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-300"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Guardando...
              </span>
            ) : cliente ? 'Actualizar Cliente' : 'Crear Cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}