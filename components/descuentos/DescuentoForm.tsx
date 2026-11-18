'use client';

import { useState } from 'react';
import type { Recurso } from '@/types';
import type {
  Descuento,
  DescuentoInput,
  TipoClienteDescuento,
} from '@/types/promociones';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DURACIONES = [90, 120];
const TIPOS: { valor: TipoClienteDescuento; etiqueta: string }[] = [
  { valor: 'SOCIO', etiqueta: 'Socio' },
  { valor: 'NO_SOCIO', etiqueta: 'No socio' },
];

interface DescuentoFormProps {
  descuento?: Descuento;
  recursos: Recurso[];
  onSubmit: (data: DescuentoInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

function alternar<T>(lista: T[], valor: T): T[] {
  return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
}

export default function DescuentoForm({
  descuento,
  recursos,
  onSubmit,
  onCancel,
  isSubmitting,
}: DescuentoFormProps) {
  const [nombre, setNombre] = useState(descuento?.nombre ?? '');
  const [porcentaje, setPorcentaje] = useState(String(descuento?.porcentaje ?? ''));
  const [fechaDesde, setFechaDesde] = useState(descuento?.fecha_desde ?? '');
  const [fechaHasta, setFechaHasta] = useState(descuento?.fecha_hasta ?? '');
  const [dias, setDias] = useState<number[]>(descuento?.dias_semana ?? [0, 1, 2, 3, 4, 5, 6]);
  const [horaDesde, setHoraDesde] = useState(descuento?.hora_desde?.substring(0, 5) ?? '');
  const [horaHasta, setHoraHasta] = useState(descuento?.hora_hasta?.substring(0, 5) ?? '');
  const [tipos, setTipos] = useState<TipoClienteDescuento[]>(
    descuento?.tipos_cliente ?? ['SOCIO', 'NO_SOCIO']
  );
  const [duraciones, setDuraciones] = useState<number[]>(
    descuento?.duraciones_minutos ?? [90, 120]
  );
  const [idRecurso, setIdRecurso] = useState(
    descuento?.id_recurso ? String(descuento.id_recurso) : ''
  );
  const [activo, setActivo] = useState(descuento?.activo ?? true);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const pct = Number(porcentaje);

    if (!nombre.trim()) return setError('El nombre es obligatorio');
    if (!(pct > 0 && pct <= 100)) return setError('El porcentaje debe ser mayor a 0 y hasta 100');
    if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
      return setError('La fecha desde no puede ser posterior a la fecha hasta');
    }
    if (dias.length === 0) return setError('Seleccioná al menos un día');
    if (tipos.length === 0) return setError('Seleccioná al menos un tipo de cliente');
    if (duraciones.length === 0) return setError('Seleccioná al menos una duración');
    if (Boolean(horaDesde) !== Boolean(horaHasta)) {
      return setError('Indicá hora desde y hora hasta, o dejá ambas vacías');
    }
    if (horaDesde && horaDesde === horaHasta) {
      return setError('La hora desde y la hora hasta no pueden ser iguales');
    }

    try {
      await onSubmit({
        nombre: nombre.trim(),
        porcentaje: pct,
        fecha_desde: fechaDesde || null,
        fecha_hasta: fechaHasta || null,
        dias_semana: [...dias].sort(),
        hora_desde: horaDesde || null,
        hora_hasta: horaHasta || null,
        tipos_cliente: tipos,
        duraciones_minutos: [...duraciones].sort(),
        id_recurso: idRecurso ? Number(idRecurso) : null,
        activo,
      });
    } catch {
      // El error lo muestra la página.
    }
  };

  const cruzaMedianoche = Boolean(horaDesde && horaHasta && horaHasta < horaDesde);
  const campo = 'w-full border border-gray-300 rounded px-3 py-2';

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">
        {descuento ? 'Editar descuento' : 'Nuevo descuento'}
      </h2>

      {error && (
        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input className={campo} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Porcentaje (%)</label>
          <input
            type="number"
            min={0.01}
            max={100}
            step="0.01"
            className={campo}
            value={porcentaje}
            onChange={(e) => setPorcentaje(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha desde (opcional)</label>
          <input type="date" className={campo} value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha hasta (opcional)</label>
          <input type="date" className={campo} value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Días de la semana</label>
        <div className="flex flex-wrap gap-3">
          {DIAS.map((nombreDia, i) => (
            <label key={i} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={dias.includes(i)} onChange={() => setDias((p) => alternar(p, i))} />
              {nombreDia}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hora desde (vacío = todo el día)</label>
          <input type="time" className={campo} value={horaDesde} onChange={(e) => setHoraDesde(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hora hasta</label>
          <input type="time" className={campo} value={horaHasta} onChange={(e) => setHoraHasta(e.target.value)} />
        </div>
        {cruzaMedianoche && (
          <p className="md:col-span-2 text-xs text-blue-700">
            La franja cruza la medianoche. El día y la fecha se evalúan sobre el día en que inicia el turno.
          </p>
        )}
        <p className="md:col-span-2 text-xs text-gray-500">
          El turno califica solo si queda entero dentro de la franja.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de cliente</label>
          {TIPOS.map((t) => (
            <label key={t.valor} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tipos.includes(t.valor)}
                onChange={() => setTipos((p) => alternar(p, t.valor))}
              />
              {t.etiqueta}
            </label>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duración del turno</label>
          {DURACIONES.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={duraciones.includes(d)}
                onChange={() => setDuraciones((p) => alternar(p, d))}
              />
              {d} min
            </label>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recurso</label>
          <select className={campo} value={idRecurso} onChange={(e) => setIdRecurso(e.target.value)}>
            <option value="">Todos los recursos</option>
            {recursos.map((r) => (
              <option key={r.id_recurso} value={r.id_recurso}>
                {r.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activo
      </label>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
