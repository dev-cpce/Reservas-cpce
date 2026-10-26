'use client';

import { useState } from 'react';
import { RecursoBloqueo, Recurso } from '@/types';

interface BloqueoFormProps {
  bloqueo?: RecursoBloqueo;
  recursos: Recurso[];
  onSubmit: (data: Omit<RecursoBloqueo, 'id_bloqueo' | 'created_at'>[]) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}

const MAX_DIAS_RANGO = 366;

export default function BloqueoForm({
  bloqueo,
  recursos,
  onSubmit,
  isSubmitting,
  onCancel
}: BloqueoFormProps) {
  const [idsRecursos, setIdsRecursos] = useState<number[]>(
    bloqueo?.id_recurso ? [bloqueo.id_recurso] : []
  );
  const [fecha, setFecha] = useState(bloqueo?.fecha || '');
  const [fechaHasta, setFechaHasta] = useState(bloqueo?.fecha_fin || '');
  const [horaInicio, setHoraInicio] = useState(bloqueo?.hora_inicio || '');
  const [horaFin, setHoraFin] = useState(bloqueo?.hora_fin || '');
  const [motivo, setMotivo] = useState(bloqueo?.motivo || '');
  const [activo, setActivo] = useState<boolean>(bloqueo?.activo ?? true);
  const [error, setError] = useState('');

  const toggleRecurso = (id: number) => {
    setIdsRecursos((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (idsRecursos.length === 0) {
      setError('Debe seleccionar al menos un recurso');
      return;
    }

    if (!fecha) {
      setError('La fecha es obligatoria');
      return;
    }

    if (!horaInicio || !horaFin) {
      setError('Debe especificar hora de inicio y hora de fin');
      return;
    }

    if (horaFin === horaInicio) {
      setError('La hora de fin no puede ser igual a la hora de inicio');
      return;
    }

    const fechaFin = fechaHasta || fecha;

    if (fechaFin < fecha) {
      setError('La fecha hasta no puede ser anterior a la fecha desde');
      return;
    }

    const cantidadDias =
      (new Date(`${fechaFin}T00:00:00Z`).getTime() - new Date(`${fecha}T00:00:00Z`).getTime()) /
        (24 * 60 * 60 * 1000) +
      1;

    if (cantidadDias > MAX_DIAS_RANGO) {
      setError(`El rango no puede superar ${MAX_DIAS_RANGO} días`);
      return;
    }

    // Un bloqueo por recurso seleccionado; el rango de fechas queda en una sola
    // fila (fecha/fecha_fin), sin generar una fila por día.
    const payload = idsRecursos.map((idRecurso) => ({
      id_recurso: idRecurso,
      fecha,
      fecha_fin: fechaFin,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      motivo: motivo.trim() || null,
      activo
    }));

    try {
      await onSubmit(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el bloqueo');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h2 className="text-xl font-semibold mb-4">
        {bloqueo ? 'Editar Bloqueo' : 'Nuevo Bloqueo'}
      </h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block mb-2 text-sm font-medium text-gray-700">
            {bloqueo ? 'Recurso' : 'Recursos'}
          </label>
          {bloqueo ? (
            <select
              id="recurso"
              value={idsRecursos[0] || 0}
              onChange={(e) => setIdsRecursos(Number(e.target.value) ? [Number(e.target.value)] : [])}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value={0}>Seleccione un recurso</option>
              {recursos.map((recurso) => (
                <option key={recurso.id_recurso} value={recurso.id_recurso}>
                  {recurso.nombre}
                </option>
              ))}
            </select>
          ) : (
            <div className="space-y-1 p-2 border border-gray-300 rounded">
              {recursos.map((recurso) => (
                <label key={recurso.id_recurso} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={idsRecursos.includes(recurso.id_recurso)}
                    onChange={() => toggleRecurso(recurso.id_recurso)}
                  />
                  {recurso.nombre}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fecha" className="block mb-2 text-sm font-medium text-gray-700">
              Fecha desde
            </label>
            <input
              type="date"
              id="fecha"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="fechaHasta" className="block mb-2 text-sm font-medium text-gray-700">
              Fecha hasta (opcional)
            </label>
            <input
              type="date"
              id="fechaHasta"
              value={fechaHasta}
              min={fecha || undefined}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="horaInicio" className="block mb-2 text-sm font-medium text-gray-700">
              Hora de Inicio
            </label>
            <input
              type="time"
              id="horaInicio"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label htmlFor="horaFin" className="block mb-2 text-sm font-medium text-gray-700">
              Hora de Fin
            </label>
            <input
              type="time"
              id="horaFin"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
        </div>

        <div className="mb-4">
          <label htmlFor="motivo" className="block mb-2 text-sm font-medium text-gray-700">
            Motivo
          </label>
          <input
            type="text"
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ej: Mantenimiento programado"
          />
        </div>

        <div className="mb-6">
          <label htmlFor="activo" className="block mb-2 text-sm font-medium text-gray-700">
            Estado
          </label>
          <select
            id="activo"
            value={activo ? '1' : '0'}
            onChange={(e) => setActivo(e.target.value === '1')}
            className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </select>
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
            {isSubmitting ? 'Guardando...' : bloqueo ? 'Actualizar Bloqueo' : 'Crear Bloqueo'}
          </button>
        </div>
      </form>
    </div>
  );
}
