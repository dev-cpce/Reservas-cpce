'use client';

import type { SeccionReportePDF } from '@/lib/generarReportePdf';

interface SelectorSeccionesPDFProps {
  seccionesSeleccionadas: SeccionReportePDF[];
  onChange: (secciones: SeccionReportePDF[]) => void;
}

const SECCIONES: {
  id: SeccionReportePDF;
  titulo: string;
  descripcion: string;
}[] = [
  {
    id: 'resumen',
    titulo: 'Resumen ejecutivo',
    descripcion: 'Indicadores generales del período seleccionado.',
  },
  {
    id: 'recursos',
    titulo: 'Reservas por recurso',
    descripcion: 'Reservas, estados e ingresos de cada recurso.',
  },
  {
    id: 'demanda',
    titulo: 'Demanda y horarios',
    descripcion: 'Distribución de reservas por horario y día de semana.',
  },
  {
    id: 'clientes',
    titulo: 'Clientes',
    descripcion: 'Reservas y gasto de los clientes del período.',
  },
  {
    id: 'ingresos',
    titulo: 'Ingresos',
    descripcion: 'Ingresos por estado de pago y por recurso.',
  },
  {
    id: 'cancelaciones',
    titulo: 'Cancelaciones',
    descripcion: 'Resumen y detalle de reservas canceladas.',
  },
  {
    id: 'bloqueos',
    titulo: 'Bloqueos y mantenimiento',
    descripcion: 'Bloqueos registrados durante el período.',
  },
  {
    id: 'ocupacion',
    titulo: 'Ocupación',
    descripcion: 'Disponibilidad, reservas y porcentaje de ocupación.',
  },
  {
    id: 'detalle',
    titulo: 'Detalle de reservas',
    descripcion: 'Listado completo de las reservas filtradas.',
  },
];

export default function SelectorSeccionesPDF({
  seccionesSeleccionadas,
  onChange,
}: SelectorSeccionesPDFProps) {
  const seleccionarTodas = () => {
    onChange(SECCIONES.map((seccion) => seccion.id));
  };

  const deseleccionarTodas = () => {
    onChange([]);
  };

  const alternarSeccion = (id: SeccionReportePDF) => {
    if (seccionesSeleccionadas.includes(id)) {
      onChange(
        seccionesSeleccionadas.filter((seccion) => seccion !== id)
      );
      return;
    }

    onChange([...seccionesSeleccionadas, id]);
  };

  return (
    <section className="mb-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Secciones del PDF
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Seleccioná qué información querés incluir en el documento.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={seleccionarTodas}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Seleccionar todas
          </button>

          <button
            type="button"
            onClick={deseleccionarTodas}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Deseleccionar todas
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {SECCIONES.map((seccion) => {
          const seleccionada = seccionesSeleccionadas.includes(seccion.id);

          return (
            <label
              key={seccion.id}
              className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                seleccionada
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="checkbox"
                checked={seleccionada}
                onChange={() => alternarSeccion(seccion.id)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />

              <div>
                <div className="font-medium text-gray-900">
                  {seccion.titulo}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  {seccion.descripcion}
                </div>
              </div>
            </label>
          );
        })}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        {seccionesSeleccionadas.length} de {SECCIONES.length} secciones
        seleccionadas.
      </div>
    </section>
  );
}