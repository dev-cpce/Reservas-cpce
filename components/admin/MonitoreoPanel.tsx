'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';

import {
  obtenerLogsMonitoreo,
  obtenerResumenMonitoreo,
} from '@/app/api/admin/monitoreo/actions';
import {
  NIVELES_LOG,
  PERIODOS_LOG,
  type FiltrosLogs,
  type NivelLog,
  type PeriodoLog,
  type ResumenMonitoreo,
  type SystemLog,
} from '@/types/monitoreo';

const ESTILO_NIVEL: Record<NivelLog, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  critical: 'bg-red-600 text-white',
};

const ETIQUETA_PERIODO: Record<PeriodoLog, string> = {
  '1h': 'Última hora',
  '24h': 'Últimas 24 horas',
  '7d': 'Últimos 7 días',
  '30d': 'Últimos 30 días',
};

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR');
}

function BadgeNivel({ nivel }: { nivel: NivelLog }) {
  return (
    <span
      className={clsx(
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase',
        ESTILO_NIVEL[nivel] ?? 'bg-gray-100 text-gray-800'
      )}
    >
      {nivel}
    </span>
  );
}

function TarjetaConteo({
  titulo,
  valor,
  activo,
  texto,
}: {
  titulo: string;
  valor: number;
  activo: string;
  texto: string;
}) {
  return (
    <div
      className={clsx(
        'rounded-lg border-l-4 bg-white p-6 shadow-md',
        valor > 0 ? activo : 'border-green-500'
      )}
    >
      <p className="text-sm font-medium text-black">{titulo}</p>
      <h3 className={clsx('mt-1 text-2xl font-bold', valor > 0 ? texto : 'text-green-600')}>
        {valor}
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        {valor > 0 ? 'Requiere revisión' : 'Sin eventos registrados'}
      </p>
    </div>
  );
}

export default function MonitoreoPanel() {
  const [filtros, setFiltros] = useState<FiltrosLogs>({
    nivel: null,
    origen: null,
    periodo: '24h',
  });
  const [resumen, setResumen] = useState<ResumenMonitoreo | null>(null);
  const [errorResumen, setErrorResumen] = useState('');
  const [cargandoResumen, setCargandoResumen] = useState(true);

  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [errorLogs, setErrorLogs] = useState('');
  const [cargandoLogs, setCargandoLogs] = useState(true);
  const [seleccionado, setSeleccionado] = useState<SystemLog | null>(null);

  const cargarResumen = useCallback(async () => {
    setCargandoResumen(true);
    setErrorResumen('');
    try {
      setResumen(await obtenerResumenMonitoreo());
    } catch {
      setResumen(null);
      setErrorResumen(
        'No se pudo comprobar la conexión con Supabase ni consultar el resumen.'
      );
    } finally {
      setCargandoResumen(false);
    }
  }, []);

  const cargarLogs = useCallback(async (f: FiltrosLogs) => {
    setCargandoLogs(true);
    setErrorLogs('');
    try {
      setLogs(await obtenerLogsMonitoreo(f));
    } catch {
      setLogs([]);
      setErrorLogs('Error al consultar los eventos. Intentá nuevamente.');
    } finally {
      setCargandoLogs(false);
    }
  }, []);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    cargarLogs(filtros);
  }, [filtros, cargarLogs]);

  const actualizar = () => {
    cargarResumen();
    cargarLogs(filtros);
  };

  const hayCriticos = (resumen?.ultimas24h.critical ?? 0) > 0;
  const hayErrores = (resumen?.ultimas24h.error ?? 0) > 0;
  const hayAdvertencias = (resumen?.ultimas24h.warning ?? 0) > 0;

  let estadoGeneral = {
    texto: 'Sin incidentes registrados en las últimas 24 horas',
    clase: 'border-green-500 bg-green-100 text-green-800',
  };
  if (hayCriticos) {
    estadoGeneral = {
      texto: 'Hay errores críticos registrados en las últimas 24 horas',
      clase: 'border-red-600 bg-red-100 text-red-800',
    };
  } else if (hayErrores) {
    estadoGeneral = {
      texto: 'Hay errores registrados en las últimas 24 horas',
      clase: 'border-red-400 bg-red-50 text-red-700',
    };
  } else if (hayAdvertencias) {
    estadoGeneral = {
      texto: 'Hay advertencias registradas en las últimas 24 horas',
      clase: 'border-yellow-500 bg-yellow-100 text-yellow-800',
    };
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Monitoreo técnico</h1>
        <button
          type="button"
          onClick={actualizar}
          disabled={cargandoLogs || cargandoResumen}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Actualizar
        </button>
      </div>

      {errorResumen && (
        <div className="mb-6 border-l-4 border-red-500 bg-red-100 p-4 text-red-700">
          <p>{errorResumen}</p>
        </div>
      )}

      {cargandoResumen && !resumen && (
        <p className="mb-6 text-sm text-gray-600">Cargando resumen...</p>
      )}

      {resumen && (
        <>
          <div className={clsx('mb-6 border-l-4 p-4 text-sm font-medium', estadoGeneral.clase)}>
            {estadoGeneral.texto}
            <span className="ml-2 font-normal">
              (basado únicamente en los eventos de <code>system_logs</code>)
            </span>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <TarjetaConteo
              titulo="Críticos (24 h)"
              valor={resumen.ultimas24h.critical}
              activo="border-red-600"
              texto="text-red-600"
            />
            <TarjetaConteo
              titulo="Errores (24 h)"
              valor={resumen.ultimas24h.error}
              activo="border-red-400"
              texto="text-red-500"
            />
            <TarjetaConteo
              titulo="Advertencias (24 h)"
              valor={resumen.ultimas24h.warning}
              activo="border-yellow-500"
              texto="text-yellow-600"
            />
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg bg-white p-6 shadow-md">
              <p className="text-sm font-medium text-black">Conectividad con Supabase</p>
              <p className="mt-1 text-lg font-bold text-green-600">
                Consulta exitosa ({resumen.supabase.latenciaMs} ms)
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Comprobado: {formatearFecha(resumen.supabase.comprobadoEn)}
              </p>
            </div>
            <div className="rounded-lg bg-white p-6 shadow-md">
              <p className="text-sm font-medium text-black">Último evento registrado</p>
              <p className="mt-1 text-lg font-bold">
                {resumen.ultimoEvento ? formatearFecha(resumen.ultimoEvento) : 'Sin eventos'}
              </p>
            </div>
          </div>
        </>
      )}

      <div className="mb-4 flex flex-wrap gap-4 rounded-lg bg-white p-4 shadow-md">
        <label className="text-sm text-gray-700">
          Nivel
          <select
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            value={filtros.nivel ?? ''}
            onChange={(e) =>
              setFiltros({ ...filtros, nivel: (e.target.value || null) as NivelLog | null })
            }
          >
            <option value="">Todos</option>
            {NIVELES_LOG.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-700">
          Origen
          <select
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            value={filtros.origen ?? ''}
            onChange={(e) => setFiltros({ ...filtros, origen: e.target.value || null })}
          >
            <option value="">Todos</option>
            {(resumen?.origenes ?? []).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-700">
          Período
          <select
            className="mt-1 block rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            value={filtros.periodo}
            onChange={(e) => setFiltros({ ...filtros, periodo: e.target.value as PeriodoLog })}
          >
            {PERIODOS_LOG.map((p) => (
              <option key={p} value={p}>
                {ETIQUETA_PERIODO[p]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {errorLogs && (
        <div className="mb-4 border-l-4 border-red-500 bg-red-100 p-4 text-red-700">
          <p>{errorLogs}</p>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg bg-white shadow-md">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-600">
            <tr>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Nivel</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Evento</th>
              <th className="px-4 py-3">Mensaje</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-black">
            {cargandoLogs && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-600">
                  Cargando eventos...
                </td>
              </tr>
            )}
            {!cargandoLogs && !errorLogs && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-600">
                  No hay eventos para los filtros seleccionados.
                </td>
              </tr>
            )}
            {!cargandoLogs &&
              logs.map((log) => (
                <tr
                  key={log.id}
                  onClick={() => setSeleccionado(log)}
                  className="cursor-pointer hover:bg-gray-50"
                >
                  <td className="whitespace-nowrap px-4 py-3">{formatearFecha(log.created_at)}</td>
                  <td className="px-4 py-3">
                    <BadgeNivel nivel={log.level} />
                  </td>
                  <td className="px-4 py-3">{log.source}</td>
                  <td className="px-4 py-3">{log.event}</td>
                  <td className="max-w-md truncate px-4 py-3">{log.message ?? '—'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        Se muestran hasta 100 eventos, del más reciente al más antiguo.
      </p>

      {seleccionado && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSeleccionado(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Detalle del evento</h2>
              <button
                type="button"
                onClick={() => setSeleccionado(null)}
                className="rounded-md px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
              >
                Cerrar
              </button>
            </div>

            <dl className="space-y-2 text-sm text-black">
              <div><dt className="font-medium">Fecha</dt><dd>{formatearFecha(seleccionado.created_at)}</dd></div>
              <div><dt className="font-medium">Nivel</dt><dd><BadgeNivel nivel={seleccionado.level} /></dd></div>
              <div><dt className="font-medium">Origen</dt><dd>{seleccionado.source}</dd></div>
              <div><dt className="font-medium">Evento</dt><dd>{seleccionado.event}</dd></div>
              <div><dt className="font-medium">Mensaje</dt><dd>{seleccionado.message ?? '—'}</dd></div>
              <div><dt className="font-medium">Request ID</dt><dd className="break-all font-mono">{seleccionado.request_id ?? '—'}</dd></div>
              <div><dt className="font-medium">Usuario</dt><dd className="break-all font-mono">{seleccionado.user_id ?? '—'}</dd></div>
              <div>
                <dt className="font-medium">Metadata</dt>
                <dd>
                  <pre className="mt-1 overflow-auto rounded-md bg-gray-100 p-3 text-xs">
                    {JSON.stringify(seleccionado.metadata ?? {}, null, 2)}
                  </pre>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
