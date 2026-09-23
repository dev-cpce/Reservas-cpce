'use client';

import { useState } from 'react';
import { Recurso } from '@/types';

interface RecursoFormProps {
  recurso?: Recurso;
  onSubmit: (data: Omit<Recurso, 'id_recurso' | 'created_at' | 'updated_at'>) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}

export default function RecursoForm({
  recurso,
  onSubmit,
  isSubmitting,
  onCancel
}: RecursoFormProps) {
  const [nombre, setNombre] = useState(recurso?.nombre || '');
  const [tipoRecurso, setTipoRecurso] = useState<Recurso['tipo_recurso']>(recurso?.tipo_recurso || 'CANCHA');
  const [deporte, setDeporte] = useState<Recurso['deporte']>(recurso?.deporte ?? null);
  const [capacidad, setCapacidad] = useState<string>(recurso?.capacidad != null ? String(recurso.capacidad) : '');
  const [estado, setEstado] = useState<Recurso['estado']>(recurso?.estado || 'DISPONIBLE');
  const [activo, setActivo] = useState<boolean>(recurso?.activo ?? true);
  const [descripcion, setDescripcion] = useState(recurso?.descripcion || '');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim()) {
      setError('El nombre del recurso es obligatorio');
      return;
    }

    try {
      await onSubmit({
        nombre: nombre.trim(),
        tipo_recurso: tipoRecurso,
        deporte,
        capacidad: capacidad.trim() === '' ? null : Number(capacidad),
        estado,
        descripcion: descripcion.trim() || null,
        activo
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el recurso');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">
        {recurso ? 'Editar Recurso' : 'Nuevo Recurso'}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="nombre" className="block mb-2 text-sm font-medium text-gray-700">
            Nombre del recurso
          </label>
          <input
            type="text"
            id="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ej: Pádel 1"
            required
          />
        </div>

        <div className="mb-4">
          <label htmlFor="tipoRecurso" className="block mb-2 text-sm font-medium text-gray-700">
            Tipo de recurso
          </label>
          <select
            id="tipoRecurso"
            value={tipoRecurso}
            onChange={(e) => setTipoRecurso(e.target.value as Recurso['tipo_recurso'])}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="CANCHA">Cancha</option>
            <option value="QUINCHO">Quincho</option>
            <option value="SALON">Salón</option>
            <option value="PILETA">Pileta</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="deporte" className="block mb-2 text-sm font-medium text-gray-700">
            Deporte
          </label>
          <select
            id="deporte"
            value={deporte ?? ''}
            onChange={(e) => setDeporte(e.target.value === '' ? null : e.target.value as NonNullable<Recurso['deporte']>)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Sin deporte</option>
            <option value="PADEL">Pádel</option>
            <option value="FUTBOL">Fútbol</option>
            <option value="TENIS">Tenis</option>
            <option value="BASQUET">Básquet</option>
            <option value="OTRO">Otro</option>
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="capacidad" className="block mb-2 text-sm font-medium text-gray-700">
            Capacidad
          </label>
          <input
            type="number"
            id="capacidad"
            value={capacidad}
            onChange={(e) => setCapacidad(e.target.value)}
            min="0"
            step="1"
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ej: 4"
          />
        </div>

        <div className="mb-4">
          <label htmlFor="estado" className="block mb-2 text-sm font-medium text-gray-700">
            Estado
          </label>
          <select
            id="estado"
            value={estado}
            onChange={(e) => setEstado(e.target.value as Recurso['estado'])}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="DISPONIBLE">Disponible</option>
            <option value="MANTENIMIENTO">Mantenimiento</option>
            <option value="FUERA_SERVICIO">Fuera de servicio</option>
          </select>
        </div>

        <div className="mb-4">
          <label htmlFor="activo" className="block mb-2 text-sm font-medium text-gray-700">
            Activo
          </label>
          <select
            id="activo"
            value={activo ? '1' : '0'}
            onChange={(e) => setActivo(e.target.value === '1')}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="1">Sí</option>
            <option value="0">No</option>
          </select>
        </div>

        <div className="mb-6">
          <label htmlFor="descripcion" className="block mb-2 text-sm font-medium text-gray-700">
            Descripción
          </label>
          <textarea
            id="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Opcional"
          />
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 rounded text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? 'Guardando...' : recurso ? 'Actualizar Recurso' : 'Crear Recurso'}
          </button>
        </div>
      </form>
    </div>
  );
}
