'use client';

import { useCallback, useEffect, useState } from 'react';

import ConversacionesList from '@/components/mensajes/ConversacionesList';
import ConversacionChat from '@/components/mensajes/ConversacionChat';
import { useConversacionesRealtime } from '@/lib/useMensajesRealtime';
import { obtenerPermisosMensajes } from '@/app/api/mensajes/actions';

export default function MensajesPage() {
  const {
    conversaciones,
    loading,
    error,
    realtimeDisponible,
    actualizarConversacion,
  } = useConversacionesRealtime();

  const [conversacionSeleccionada, setConversacionSeleccionada] = useState<number | null>(null);
  const [puedeEnviar, setPuedeEnviar] = useState(false);

  useEffect(() => {
    let activo = true;

    obtenerPermisosMensajes()
      .then((permisos) => {
        if (activo) setPuedeEnviar(permisos.puedeEnviar);
      })
      .catch(() => {
        if (activo) setPuedeEnviar(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  const handleSeleccionar = useCallback((id: number) => {
    setConversacionSeleccionada(id);
  }, []);

  const handleVolver = useCallback(() => {
    setConversacionSeleccionada(null);
  }, []);

  const conversacionActiva = conversaciones.find((c) => c.id === conversacionSeleccionada) ?? null;

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Bandeja de WhatsApp</h2>
        <p className="text-sm text-gray-500">
          Conversaciones con clientes vía WhatsApp, atendidas por el asistente o por el equipo.
        </p>
      </div>

      {!realtimeDisponible && (
        <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          La actualización en tiempo real no está disponible en este momento. La bandeja
          puede tardar en reflejar mensajes nuevos.
        </div>
      )}

      <div className="flex-1 min-h-[480px] h-[calc(100vh-14rem)] bg-white rounded-lg shadow border border-gray-200 overflow-hidden flex">
        {/* Lista de conversaciones */}
        <div
          className={`${
            conversacionSeleccionada ? 'hidden lg:flex' : 'flex'
          } w-full lg:w-80 xl:w-96 border-r border-gray-200 flex-col shrink-0`}
        >
          {loading && conversaciones.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
              <p className="mt-3 text-sm">Cargando conversaciones...</p>
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            </div>
          ) : (
            <ConversacionesList
              conversaciones={conversaciones}
              conversacionSeleccionada={conversacionSeleccionada}
              onSeleccionar={handleSeleccionar}
            />
          )}
        </div>

        {/* Conversación seleccionada */}
        <div className={`${conversacionSeleccionada ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0`}>
          {conversacionActiva ? (
            <ConversacionChat
              key={conversacionActiva.id}
              conversacionResumen={conversacionActiva}
              puedeEnviar={puedeEnviar}
              onVolver={handleVolver}
              onConversacionCambiada={actualizarConversacion}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-center px-6 text-gray-500">
              <p className="text-sm">Seleccioná una conversación para ver los mensajes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
