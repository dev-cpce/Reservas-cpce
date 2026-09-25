'use client';

import { useState, useCallback, useEffect } from 'react';
import FiltrosReporte from '@/components/reportes/FiltrosReporte';
import ReporteResultados from '@/components/reportes/ReporteResultados';
import SelectorSeccionesPDF from '@/components/reportes/SelectorSeccionesPDF';
import {
  generarReportePdf,
  type SeccionReportePDF,
} from '@/lib/generarReportePdf';
import notifications from '@/lib/notifications';
import {
  obtenerReporteCompleto,
  obtenerRecursosParaFiltro,
} from '@/app/api/reportes/actions';
import type {
  FiltrosReporte as FiltrosReporteType,
  ReporteCompleto,
  RecursoFiltroOpcion,
} from '@/types/reportes';

function obtenerFechaLocal(fecha: Date): string {
  return fecha.getFullYear() + '-' +
    String(fecha.getMonth() + 1).padStart(2, '0') + '-' +
    String(fecha.getDate()).padStart(2, '0');
}

export default function ReportesPage() {
  const hoy = obtenerFechaLocal(new Date());
  const hace30Dias = obtenerFechaLocal(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  );

  const [filtros, setFiltros] = useState<FiltrosReporteType>({
    fechaDesde: hace30Dias,
    fechaHasta: hoy,
    idRecurso: null,
    tipoCliente: null,
    estadoReserva: null,
  });

  const [recursos, setRecursos] = useState<RecursoFiltroOpcion[]>([]);
  const [reporte, setReporte] = useState<ReporteCompleto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [seccionesPDF, setSeccionesPDF] = useState<SeccionReportePDF[]>([
    'resumen',
    'recursos',
    'demanda',
    'clientes',
    'ingresos',
    'cancelaciones',
    'bloqueos',
    'ocupacion',
    'detalle',
  ]);

  useEffect(() => {
    obtenerRecursosParaFiltro()
      .then(setRecursos)
      .catch(() => setRecursos([]));
  }, []);

  const generarReporte = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const data = await obtenerReporteCompleto(filtros);
      setReporte(data);
    } catch {
      setErrorMessage('Error al generar el reporte. Intenta nuevamente.');
      notifications.error('Error al generar el reporte');
    } finally {
      setIsLoading(false);
    }
  }, [filtros]);

  const descargarPDF = useCallback(async () => {
    if (seccionesPDF.length === 0) {
      notifications.error('Seleccioná al menos una sección para el PDF');
      return;
    }

    setIsGeneratingPDF(true);

    try {
      const data = await obtenerReporteCompleto(filtros);

      setReporte(data);

      generarReportePdf(data, seccionesPDF);

      notifications.success('PDF generado correctamente');
    } catch {
      notifications.error('Error al generar el PDF');
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [filtros, seccionesPDF]);

  useEffect(() => {
    generarReporte();

    // Solo se ejecuta al montar; luego el usuario dispara la búsqueda con el botón.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container mx-auto px-4 py-6">
      <FiltrosReporte
        filtros={filtros}
        recursos={recursos}
        onChange={setFiltros}
        onBuscar={generarReporte}
        isLoading={isLoading}
      />

      <SelectorSeccionesPDF
        seccionesSeleccionadas={seccionesPDF}
        onChange={setSeccionesPDF}
      />

      <div className="mb-6 flex justify-end">
        <button
          type="button"
          onClick={descargarPDF}
          disabled={isGeneratingPDF || seccionesPDF.length === 0}
          className="rounded-md bg-green-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGeneratingPDF ? 'Generando PDF...' : 'Descargar PDF'}
        </button>
      </div>

      {errorMessage && (
        <div className="mb-6 border-l-4 border-red-500 bg-red-100 p-4 text-red-700">
          <p>{errorMessage}</p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center">
            <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-blue-500"></div>
            <p className="mt-4 text-gray-700">Generando reporte...</p>
          </div>
        </div>
      )}

      {!isLoading && reporte && (
        <ReporteResultados reporte={reporte} />
      )}
    </div>
  );
}