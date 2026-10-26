'use client';

import clsx from 'clsx';
import type { MensajeHistorial } from '@/types/api';

interface MensajeBubbleProps {
  mensaje: MensajeHistorial;
}

function formatearHora(fechaISO: string): string {
  const fecha = new Date(fechaISO);

  if (isNaN(fecha.getTime())) return '';

  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

function etiquetaEstado(mensaje: MensajeHistorial): string | null {
  switch (mensaje.estado) {
    case 'fallido':
      return `Error al enviar${mensaje.error_detalle ? `: ${mensaje.error_detalle}` : ''}`;
    case 'leido':
      return 'Leído';
    case 'entregado':
      return 'Entregado';
    case 'enviado':
      return 'Enviado';
    default:
      return null;
  }
}

export default function MensajeBubble({ mensaje }: MensajeBubbleProps) {
  const esEntrante = mensaje.direccion === 'entrante';
  const esEmpleado = mensaje.origen === 'empleado';
  const estado = !esEntrante ? etiquetaEstado(mensaje) : null;

  return (
    <div className={clsx('flex', esEntrante ? 'justify-start' : 'justify-end')}>
      <div className="max-w-[75%] flex flex-col">
        <div
          className={clsx(
            'px-3.5 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words shadow-sm',
            esEntrante && 'bg-gray-100 text-gray-900 rounded-bl-sm',
            !esEntrante && esEmpleado && 'bg-emerald-600 text-white rounded-br-sm',
            !esEntrante && !esEmpleado && 'bg-blue-600 text-white rounded-br-sm'
          )}
        >
          {mensaje.texto}
        </div>

        <div
          className={clsx(
            'mt-1 flex items-center gap-1 text-[11px]',
            esEntrante ? 'justify-start text-gray-400' : 'justify-end text-gray-400'
          )}
        >
          {!esEntrante && (
            <span className="font-medium text-gray-500">
              {esEmpleado ? 'Empleado' : 'Bot'} ·{' '}
            </span>
          )}
          <span>{formatearHora(mensaje.created_at)}</span>
          {estado && (
            <span className={clsx(mensaje.estado === 'fallido' && 'text-red-600 font-medium')}>
              · {estado}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
