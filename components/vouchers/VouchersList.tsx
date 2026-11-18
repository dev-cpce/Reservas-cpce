'use client';

import { Fragment, useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, XCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import type { Voucher, VoucherUso } from '@/types/promociones';
import { obtenerUsosVoucher } from '@/app/api/vouchers/actions';

interface VouchersListProps {
  vouchers: Voucher[];
  puedeEditar: boolean;
  onChangeStatus: (id: number, activo: boolean) => void;
}

const ETIQUETA_ESTADO: Record<string, { texto: string; clase: string }> = {
  usado: { texto: 'Ocupado', clase: 'bg-blue-100 text-blue-800' },
  cancelado_cliente: { texto: 'Cancelado por cliente (cupo consumido)', clase: 'bg-yellow-100 text-yellow-800' },
  anulado: { texto: 'Anulado (cupo devuelto)', clase: 'bg-gray-200 text-gray-700' },
};

function formatearFecha(f: string | null) {
  if (!f) return 'Sin vencimiento';
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

export default function VouchersList({ vouchers, puedeEditar, onChangeStatus }: VouchersListProps) {
  const [abierto, setAbierto] = useState<number | null>(null);
  const [usos, setUsos] = useState<Record<number, VoucherUso[]>>({});
  const [errorUsos, setErrorUsos] = useState('');

  const alternarUsos = async (id: number) => {
    if (abierto === id) return setAbierto(null);

    setAbierto(id);
    setErrorUsos('');

    try {
      setUsos((prev) => ({ ...prev, [id]: [] }));
      const lista = await obtenerUsosVoucher(id);
      setUsos((prev) => ({ ...prev, [id]: lista }));
    } catch (e) {
      setErrorUsos(e instanceof Error ? e.message : 'No se pudieron cargar los usos');
    }
  };

  if (vouchers.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
        Todavía no hay vouchers creados.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
          <tr>
            <th className="px-4 py-3"></th>
            <th className="px-4 py-3">Código</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Usos del mes</th>
            <th className="px-4 py-3">Vigente hasta</th>
            <th className="px-4 py-3">Estado</th>
            {puedeEditar && <th className="px-4 py-3 text-right">Acciones</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {vouchers.map((v) => (
            <Fragment key={v.id_voucher}>
              <tr className={v.activo ? '' : 'opacity-60'}>
                <td className="px-4 py-3">
                  <button onClick={() => alternarUsos(v.id_voucher)} title="Ver usos" className="text-gray-500">
                    {abierto === v.id_voucher ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                  </button>
                </td>
                <td className="px-4 py-3 font-mono font-medium text-gray-900">{v.codigo}</td>
                <td className="px-4 py-3">
                  {v.cliente ? `${v.cliente.apellido}, ${v.cliente.nombre}` : `Cliente ${v.id_cliente}`}
                  {v.cliente?.telefono && <span className="text-gray-500"> · {v.cliente.telefono}</span>}
                </td>
                <td className="px-4 py-3">
                  {v.usos_mes ?? 0} / {v.cupo_mensual}
                </td>
                <td className="px-4 py-3">{formatearFecha(v.vigente_hasta)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${
                      v.activo ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {v.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                {puedeEditar && (
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onChangeStatus(v.id_voucher, !v.activo)}
                      title={v.activo ? 'Desactivar' : 'Activar'}
                      className={v.activo ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}
                    >
                      {v.activo ? <XCircleIcon className="h-5 w-5" /> : <CheckCircleIcon className="h-5 w-5" />}
                    </button>
                  </td>
                )}
              </tr>

              {abierto === v.id_voucher && (
                <tr className="bg-gray-50">
                  <td></td>
                  <td colSpan={puedeEditar ? 6 : 5} className="px-4 py-3">
                    {errorUsos ? (
                      <p className="text-red-600">{errorUsos}</p>
                    ) : !usos[v.id_voucher] || usos[v.id_voucher].length === 0 ? (
                      <p className="text-gray-500">Sin usos registrados.</p>
                    ) : (
                      <ul className="space-y-1">
                        {usos[v.id_voucher].map((u) => {
                          const et = ETIQUETA_ESTADO[u.estado];
                          return (
                            <li key={u.id_uso} className="flex flex-wrap items-center gap-2">
                              <span>{formatearFecha(u.fecha_reserva)}</span>
                              <span className="text-gray-500">
                                {u.id_reserva ? `Reserva #${u.id_reserva}` : 'Reserva eliminada'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${et?.clase ?? ''}`}>
                                {et?.texto ?? u.estado}
                              </span>
                              {u.reprogramaciones > 0 && (
                                <span className="text-xs text-gray-500">
                                  Reprogramada {u.reprogramaciones} {u.reprogramaciones === 1 ? 'vez' : 'veces'}
                                </span>
                              )}
                              {u.motivo && <span className="text-xs text-gray-500">({u.motivo})</span>}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
