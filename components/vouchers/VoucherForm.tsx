'use client';

import { useState } from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import type { Cliente } from '@/types';
import type { VoucherInput } from '@/types/promociones';
import { buscarClientes } from '@/app/api/clientes/actions';

interface VoucherFormProps {
  onSubmit: (data: VoucherInput) => Promise<void>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export default function VoucherForm({ onSubmit, onCancel, isSubmitting }: VoucherFormProps) {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<Cliente[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [cupo, setCupo] = useState('2');
  const [vigenteHasta, setVigenteHasta] = useState('');
  const [error, setError] = useState('');

  const buscar = async () => {
    const q = termino.trim();
    if (q.length < 2) return setError('Ingresá al menos 2 caracteres para buscar');

    setError('');
    setBuscando(true);
    try {
      const lista = (await buscarClientes(q)) as Cliente[];
      setResultados(lista.slice(0, 20));
      if (lista.length === 0) setError('No se encontraron clientes');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al buscar clientes');
    } finally {
      setBuscando(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cupoNum = Number(cupo);

    if (!cliente) return setError('Seleccioná un cliente');
    if (!Number.isInteger(cupoNum) || cupoNum < 1) return setError('El cupo mensual debe ser al menos 1');

    try {
      await onSubmit({
        id_cliente: cliente.id_cliente,
        cupo_mensual: cupoNum,
        vigente_hasta: vigenteHasta || null,
      });
    } catch {
      // El error lo muestra la página.
    }
  };

  const campo = 'w-full border border-gray-300 rounded px-3 py-2';

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Nuevo voucher</h2>

      {error && (
        <div className="p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Cliente beneficiario</label>

        {cliente ? (
          <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded px-3 py-2">
            <span className="text-sm">
              {cliente.apellido}, {cliente.nombre}
              {cliente.telefono ? ` · ${cliente.telefono}` : ''}
            </span>
            <button type="button" onClick={() => setCliente(null)} className="text-sm text-blue-700 hover:underline">
              Cambiar
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                className={campo}
                placeholder="Nombre, apellido, teléfono o matrícula"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    buscar();
                  }
                }}
              />
              <button
                type="button"
                onClick={buscar}
                disabled={buscando}
                className="px-3 py-2 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                <MagnifyingGlassIcon className="h-5 w-5" />
              </button>
            </div>

            {resultados.length > 0 && (
              <ul className="mt-2 border border-gray-200 rounded divide-y max-h-56 overflow-y-auto">
                {resultados.map((c) => (
                  <li key={c.id_cliente}>
                    <button
                      type="button"
                      onClick={() => {
                        setCliente(c);
                        setResultados([]);
                        setError('');
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {c.apellido}, {c.nombre}
                      <span className="text-gray-500">
                        {c.telefono ? ` · ${c.telefono}` : ''}
                        {c.nro_matricula ? ` · Mat. ${c.nro_matricula}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Turnos gratis por mes</label>
          <input
            type="number"
            min={1}
            step={1}
            className={campo}
            value={cupo}
            onChange={(e) => setCupo(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vigente hasta (opcional)</label>
          <input type="date" className={campo} value={vigenteHasta} onChange={(e) => setVigenteHasta(e.target.value)} />
        </div>
      </div>

      <p className="text-xs text-gray-500">
        El código (CPCE_C + 8 caracteres) se genera automáticamente. Cada cliente puede tener un solo voucher activo.
      </p>

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-100">
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Creando...' : 'Crear voucher'}
        </button>
      </div>
    </form>
  );
}
