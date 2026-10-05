'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePagosRealtime, type Pago } from '@/lib/usePagosRealtime';
import PagosList from '@/components/pagos/PagosList';
import PagoModal from '@/components/pagos/PagoModal';
import { obtenerPermisosPagos } from '@/app/api/pagos/actions';

export default function PagosPage() {
const {
pagos,
loading,
error,
crearPago,
actualizarPago
} = usePagosRealtime();

const [showModal, setShowModal] = useState(false);
const [editingPago, setEditingPago] = useState<Pago | null>(null);
const [filtroEstado, setFiltroEstado] = useState<string>('todos');

const [permisos, setPermisos] = useState({
puedeConfirmar: false,
puedeEditar: false
});

const cargarPermisos = useCallback(async () => {
try {
const permisosPagos = await obtenerPermisosPagos();
setPermisos(permisosPagos);
} catch {
setPermisos({
puedeConfirmar: false,
puedeEditar: false
});
}
}, []);

const obtenerFechaHoy = () => {
const opciones = {
timeZone: 'America/Argentina/Buenos_Aires',
year: 'numeric',
month: '2-digit',
day: '2-digit'
} as const;

return new Intl.DateTimeFormat('sv-SE', opciones).format(new Date());

};

const [fechaFiltro, setFechaFiltro] = useState<string>(
obtenerFechaHoy()
);

const [paginaActual, setPaginaActual] = useState(1);
const pagosPorPagina = 10;

useEffect(() => {
cargarPermisos();
}, [cargarPermisos]);

useEffect(() => {
setPaginaActual(1);
}, [fechaFiltro, filtroEstado]);

const convertirFechaABuenosAires = (
fechaTimestamptz: string
) => {
if (!fechaTimestamptz) return 'No disponible';

try {
  const fecha = new Date(fechaTimestamptz);

  if (isNaN(fecha.getTime())) {
    return 'Fecha inválida';
  }

  const opciones: Intl.DateTimeFormatOptions = {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };

  return new Intl.DateTimeFormat(
    'es-AR',
    opciones
  ).format(fecha);
} catch {
  return 'Error de formato';
}

};

const obtenerFechaBuenosAires = (
fechaTimestamptz: string
) => {
if (!fechaTimestamptz) return '';

try {
  const fecha = new Date(fechaTimestamptz);

  if (isNaN(fecha.getTime())) {
    return '';
  }

  const opciones = {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  } as const;

  return new Intl.DateTimeFormat(
    'sv-SE',
    opciones
  ).format(fecha);
} catch {
  return '';
}

};

const handleAgregarPago = () => {
setEditingPago(null);
setShowModal(true);
};

const handleEditarPago = (pago: Pago) => {
setEditingPago(pago);
setShowModal(true);
};

const handleGuardarPago = async (
pagoData: Omit<Pago, 'id_pago' | 'fecha_pago'>
) => {
try {
if (editingPago) {
await actualizarPago(editingPago.id_pago, {
estado_pago: pagoData.estado_pago,
mp_id: pagoData.mp_id || undefined
});
} else {
await crearPago(pagoData);
}


  setShowModal(false);
  setEditingPago(null);
} catch (error) {
  throw error;
}


};

const pagosFiltrados = pagos.filter((pago) => {
const pasaEstado =
filtroEstado === 'todos' ||
pago.estado_pago === filtroEstado;

const fechaPagoBuenosAires =
  obtenerFechaBuenosAires(pago.fecha_pago);

const pasaFecha =
  fechaPagoBuenosAires === fechaFiltro;

return pasaEstado && pasaFecha;
});

const pagosOrdenados = [...pagosFiltrados].sort(
(a, b) => {
const fechaA = new Date(a.fecha_pago);
const fechaB = new Date(b.fecha_pago);

  return fechaB.getTime() - fechaA.getTime();
}

);

const totalPaginas = Math.ceil(
pagosOrdenados.length / pagosPorPagina
);

const indiceInicio =
(paginaActual - 1) * pagosPorPagina;

const indiceFin =
indiceInicio + pagosPorPagina;

const pagosPaginados =
pagosOrdenados.slice(indiceInicio, indiceFin);

const getEstadisticas = () => {
const pagosParaStats = pagos.filter((pago) => {
const fechaPagoBuenosAires =
obtenerFechaBuenosAires(pago.fecha_pago);

  return fechaPagoBuenosAires === fechaFiltro;
});

const total = pagosParaStats.length;

const completados = pagosParaStats.filter(
  (p) => p.estado_pago === 'aprobado'
).length;

const pendientes = pagosParaStats.filter(
  (p) => p.estado_pago === 'pendiente'
).length;

const cancelados = pagosParaStats.filter(
  (p) => p.estado_pago === 'cancelado'
).length;

const desconocidos = pagosParaStats.filter(
  (p) => p.estado_pago === 'desconocido'
).length;

const montoTotal = pagosParaStats
  .filter((p) => p.estado_pago === 'aprobado')
  .reduce(
    (sum, p) => sum + p.monto,
    0
  );

return {
  total,
  completados,
  pendientes,
  cancelados,
  desconocidos,
  montoTotal
};

};

const stats = getEstadisticas();

if (error) {
return ( <div className="max-w-7xl mx-auto"> <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg"> <h3 className="font-medium">
Error al cargar pagos </h3>

```
      <p className="mt-1">{error}</p>
    </div>
  </div>
);

}

return ( <div className="max-w-7xl mx-auto">
{/* Header */} <div className="flex justify-between items-center mb-8"> <div className="flex space-x-3">
{permisos.puedeConfirmar && ( <button
           onClick={handleAgregarPago}
           className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
         > <svg
             className="-ml-1 mr-2 h-4 w-4"
             fill="none"
             viewBox="0 0 24 24"
             stroke="currentColor"
           > <path
               strokeLinecap="round"
               strokeLinejoin="round"
               strokeWidth={2}
               d="M12 6v6m0 0v6m0-6h6m-6 0H6"
             /> </svg>


          Nuevo Pago
        </button>
      )}
    </div>
  </div>

  {/* Estadísticas */}
  <div className="grid grid-cols-1 gap-5 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5 mb-8">
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-blue-500 rounded-md flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                />
              </svg>
            </div>
          </div>

          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                Monto Total
              </dt>

              <dd className="text-lg font-medium text-gray-900">
                ${stats.montoTotal.toLocaleString()}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-green-500 rounded-md flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>

          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                Aprobados
              </dt>

              <dd className="text-lg font-medium text-gray-900">
                {stats.completados}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-yellow-500 rounded-md flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>

          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                Pendientes
              </dt>

              <dd className="text-lg font-medium text-gray-900">
                {stats.pendientes}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-red-500 rounded-md flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
          </div>

          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                Cancelados
              </dt>

              <dd className="text-lg font-medium text-gray-900">
                {stats.cancelados}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>

    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="p-5">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 bg-gray-500 rounded-md flex items-center justify-center">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          </div>

          <div className="ml-5 w-0 flex-1">
            <dl>
              <dt className="text-sm font-medium text-gray-500 truncate">
                Desconocidos
              </dt>

              <dd className="text-lg font-medium text-gray-900">
                {stats.desconocidos}
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </div>
  </div>

  {/* Filtros */}
  <div className="bg-white shadow rounded-lg p-6 mb-6">
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center space-x-2">
        <label className="text-sm font-medium text-gray-700">
          Fecha:
        </label>

        <input
          type="date"
          value={fechaFiltro}
          onChange={(e) =>
            setFechaFiltro(e.target.value)
          }
          className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />

        <button
          onClick={() =>
            setFechaFiltro(obtenerFechaHoy())
          }
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
        >
          Hoy
        </button>
      </div>

      <div className="flex items-center space-x-2">
        <label
          htmlFor="estado-filter"
          className="text-sm font-medium text-gray-700"
        >
          Estado:
        </label>

        <select
          id="estado-filter"
          value={filtroEstado}
          onChange={(e) =>
            setFiltroEstado(e.target.value)
          }
          className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="todos">Todos</option>
          <option value="pendiente">Pendientes</option>
          <option value="aprobado">Aprobados</option>
          <option value="cancelado">Cancelados</option>
          <option value="desconocido">Desconocidos</option>
        </select>
      </div>

      <span className="text-sm text-gray-700">
        Total pagos{' '}
        {fechaFiltro === obtenerFechaHoy()
          ? 'hoy'
          : fechaFiltro
              .split('-')
              .slice(1)
              .join('/')}{' '}
        : {pagosFiltrados.length}

        {totalPaginas > 1 && (
          <span className="ml-2 text-gray-500">
            (Página {paginaActual} de {totalPaginas})
          </span>
        )}
      </span>
    </div>
  </div>

  {/* Lista de Pagos */}
  {loading && pagos.length === 0 ? (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>

        <p className="mt-2 text-gray-500">
          Cargando pagos...
        </p>
      </div>
    </div>
  ) : (
    <>
      <PagosList
        pagos={pagosPaginados}
        onActualizarPago={actualizarPago}
        onEditPago={handleEditarPago}
        convertirFechaABuenosAires={
          convertirFechaABuenosAires
        }
        puedeConfirmar={permisos.puedeConfirmar}
        puedeEditar={permisos.puedeEditar}
      />

      {/* Controles de paginación */}
      {totalPaginas > 1 && (
        <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <p className="text-sm text-gray-700">
                Mostrando {indiceInicio + 1} a{' '}
                {Math.min(
                  indiceFin,
                  pagosFiltrados.length
                )}{' '}
                de {pagosFiltrados.length} pagos
              </p>
            </div>

            <div className="flex space-x-2">
              <button
                onClick={() =>
                  setPaginaActual(
                    Math.max(1, paginaActual - 1)
                  )
                }
                disabled={paginaActual === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>

              {Array.from(
                { length: totalPaginas },
                (_, i) => i + 1
              ).map((pagina) => (
                <button
                  key={pagina}
                  onClick={() =>
                    setPaginaActual(pagina)
                  }
                  className={`px-3 py-1 text-sm border rounded ${
                    pagina === paginaActual
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {pagina}
                </button>
              ))}

              <button
                onClick={() =>
                  setPaginaActual(
                    Math.min(
                      totalPaginas,
                      paginaActual + 1
                    )
                  )
                }
                disabled={
                  paginaActual === totalPaginas
                }
                className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )}

  {/* Modal */}
  <PagoModal
    isOpen={showModal}
    onClose={() => {
      setShowModal(false);
      setEditingPago(null);
    }}
    onSave={handleGuardarPago}
    pago={editingPago}
    title={
      editingPago ? 'Editar Pago' : 'Nuevo Pago'
    }
  />
</div>

);
}
