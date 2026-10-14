'use client';

import clsx from 'clsx';
import type { ConversacionResumen } from '@/types/api';

interface ConversacionesListProps {
  conversaciones: ConversacionResumen[];
  conversacionSeleccionada: number | null;
  onSeleccionar: (id: number) => void;
}

function nombreCliente(conversacion: ConversacionResumen): string {
  if (conversacion.cliente) {
    const nombreCompleto = `${conversacion.cliente.nombre} ${conversacion.cliente.apellido}`.trim();

    if (nombreCompleto) return nombreCompleto;
  }

  return conversacion.cliente?.telefono || conversacion.chat_id;
}

function formatearHora(fechaISO: string | null): string {
  if (!fechaISO) return '';

  const fecha = new Date(fechaISO);

  if (isNaN(fecha.getTime())) return '';

  const hoy = new Date();
  const esHoy =
    fecha.getFullYear() === hoy.getFullYear() &&
    fecha.getMonth() === hoy.getMonth() &&
    fecha.getDate() === hoy.getDate();

  if (esHoy) {
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(fecha);
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
  }).format(fecha);
}

function prefijoUltimoMensaje(conversacion: ConversacionResumen): string {
  const ultimo = conversacion.ultimo_mensaje;

  if (!ultimo) return '';
  if (ultimo.direccion === 'entrante') return '';
  if (ultimo.origen === 'empleado') return 'Vos: ';

  return 'Bot: ';
}

export default function ConversacionesList({
  conversaciones,
  conversacionSeleccionada,
  onSeleccionar,
}: ConversacionesListProps) {
  if (conversaciones.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 text-gray-500">
        <p className="text-sm">
          Todavía no hay conversaciones de WhatsApp en la bandeja.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto divide-y divide-gray-100">
      {conversaciones.map((conversacion) => {
        const activa = conversacion.id === conversacionSeleccionada;
        const tieneNoLeidos = conversacion.no_leidos > 0;

        return (
          <li key={conversacion.id}>
            <button
              type="button"
              onClick={() => onSeleccionar(conversacion.id)}
              className={clsx(
                'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors duration-150',
                activa ? 'bg-blue-50' : 'hover:bg-gray-50'
              )}
            >
              <div className="h-10 w-10 shrink-0 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold">
                {nombreCliente(conversacion).charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={clsx(
                      'truncate text-sm',
                      tieneNoLeidos ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'
                    )}
                  >
                    {nombreCliente(conversacion)}
                  </p>

                  <span className="text-xs text-gray-400 shrink-0">
                    {formatearHora(conversacion.ultimo_mensaje_at)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <p
                    className={clsx(
                      'truncate text-xs',
                      tieneNoLeidos ? 'text-gray-700' : 'text-gray-500'
                    )}
                  >
                    {conversacion.ultimo_mensaje
                      ? `${prefijoUltimoMensaje(conversacion)}${conversacion.ultimo_mensaje.texto}`
                      : 'Sin mensajes'}
                  </p>

                  {tieneNoLeidos && (
                    <span className="shrink-0 min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center">
                      {conversacion.no_leidos}
                    </span>
                  )}
                </div>

                <span
                  className={clsx(
                    'inline-block mt-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium',
                    conversacion.modo === 'humano'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800'
                  )}
                >
                  {conversacion.modo === 'humano' ? 'Humano' : 'Bot'}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
