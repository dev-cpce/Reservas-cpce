'use client';

import type { Recurso } from '@/types';
import type { Descuento } from '@/types/promociones';
import { PencilIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface DescuentosListProps {
  descuentos: Descuento[];
  recursos: Recurso[];
  puedeEditar: boolean;
  onEdit: (d: Descuento) => void;
  onChangeStatus: (id: number, activo: boolean) => void;
}

const hora = (h: string | null) => h?.substring(0, 5) ?? '';

function formatearFecha(f: string | null) {
  if (!f) return '';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

export default function DescuentosList({
  descuentos,
  recursos,
  puedeEditar,
  onEdit,
  onChangeStatus,
}: DescuentosListProps) {
  if (descuentos.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        Todavía no hay descuentos configurados.
      </div>
    );
  }

  const vigencia = (d: Descuento) => {
    if (!d.fecha_desde && !d.fecha_hasta) return 'Sin límite';
    return `${d.fecha_desde ? formatearFecha(d.fecha_desde) : '…'} → ${
      d.fecha_hasta ? formatearFecha(d.fecha_hasta) : '…'
    }`;
  };

  const dias = (d: Descuento) =>
    d.dias_semana.length === 7 ? 'Todos' : [...d.dias_semana].sort().map((i) => DIAS[i]).join(', ');

  const franja = (d: Descuento) =>
    d.hora_desde && d.hora_hasta ? `${hora(d.hora_desde)} a ${hora(d.hora_hasta)}` : 'Todo el día';

  const recurso = (d: Descuento) =>
    d.id_recurso
      ? recursos.find((r) => r.id_recurso === d.id_recurso)?.nombre ?? `Recurso ${d.id_recurso}`
      : 'Todos';

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">%</th>
            <th className="px-4 py-3">Vigencia</th>
            <th className="px-4 py-3">Días</th>
            <th className="px-4 py-3">Horario</th>
            <th className="px-4 py-3">Clientes</th>
            <th className="px-4 py-3">Duración</th>
            <th className="px-4 py-3">Recurso</th>
            <th className="px-4 py-3">Estado</th>
            {puedeEditar && <th className="px-4 py-3 text-right">Acciones</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {descuentos.map((d) => (
            <tr key={d.id_descuento} className={d.activo ? '' : 'opacity-60'}>
              <td className="px-4 py-3 font-medium text-gray-900">{d.nombre}</td>
              <td className="px-4 py-3">{Number(d.porcentaje)}%</td>
              <td className="px-4 py-3">{vigencia(d)}</td>
              <td className="px-4 py-3">{dias(d)}</td>
              <td className="px-4 py-3">{franja(d)}</td>
              <td className="px-4 py-3">
                {d.tipos_cliente.length === 2
                  ? 'Socio y no socio'
                  : d.tipos_cliente[0] === 'SOCIO'
                    ? 'Solo socio'
                    : 'Solo no socio'}
              </td>
              <td className="px-4 py-3">{d.duraciones_minutos.join(' / ')} min</td>
              <td className="px-4 py-3">{recurso(d)}</td>
              <td className="px-4 py-3">
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    d.activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {d.activo ? 'Activo' : 'Inactivo'}
                </span>
              </td>
              {puedeEditar && (
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    onClick={() => onEdit(d)}
                    title="Editar"
                    className="p-1 text-blue-600 hover:text-blue-800"
                  >
                    <PencilIcon className="h-5 w-5" />
                  </button>
                  <button
                    onClick={() => onChangeStatus(d.id_descuento, !d.activo)}
                    title={d.activo ? 'Desactivar' : 'Activar'}
                    className={`p-1 ${d.activo ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}
                  >
                    {d.activo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
