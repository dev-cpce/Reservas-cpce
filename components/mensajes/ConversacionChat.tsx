'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { ArrowLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';

import MensajeBubble from './MensajeBubble';
import type { ConversacionResumen, ModoConversacion } from '@/types/api';
import { useConversacionDetalle } from '@/lib/useMensajesRealtime';

const VENTANA_24H_MS = 24 * 60 * 60 * 1000;
const TEXTO_MAX = 4096;

interface ConversacionChatProps {
  conversacionResumen: ConversacionResumen;
  puedeEnviar: boolean;
  onVolver?: () => void;
  onConversacionCambiada: (id: number, patch: Partial<ConversacionResumen>) => void;
}

function nombreCliente(conversacion: ConversacionResumen): string {
  if (conversacion.cliente) {
    const nombreCompleto = `${conversacion.cliente.nombre} ${conversacion.cliente.apellido}`.trim();

    if (nombreCompleto) return nombreCompleto;
  }

  return conversacion.cliente?.telefono || conversacion.chat_id;
}

export default function ConversacionChat({
  conversacionResumen,
  puedeEnviar,
  onVolver,
  onConversacionCambiada,
}: ConversacionChatProps) {
  const {
    conversacion,
    mensajes,
    loading,
    error,
    enviando,
    enviarMensaje,
    cambiarModo,
    marcarLeido,
  } = useConversacionDetalle(conversacionResumen.id, onConversacionCambiada);

  const [texto, setTexto] = useState('');
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const marcadoLeidoRef = useRef<number | null>(null);

  // Marca la conversación como leída una vez por selección (no en cada
  // actualización de Realtime, para no spamear al servidor).
  useEffect(() => {
    if (marcadoLeidoRef.current === conversacionResumen.id) return;

    marcadoLeidoRef.current = conversacionResumen.id;
    marcarLeido();
  }, [conversacionResumen.id, marcarLeido]);

  useEffect(() => {
    listaRef.current?.scrollTo({ top: listaRef.current.scrollHeight });
  }, [mensajes.length]);

  const ultimoMensajeCliente = conversacion?.ultimo_mensaje_cliente_at
    ? new Date(conversacion.ultimo_mensaje_cliente_at).getTime()
    : null;
  const ventanaVencida = !ultimoMensajeCliente || Date.now() - ultimoMensajeCliente > VENTANA_24H_MS;
  const modoActual: ModoConversacion = conversacion?.modo ?? conversacionResumen.modo;

  const handleEnviar = async () => {
    const textoLimpio = texto.trim();

    if (!textoLimpio || enviando || ventanaVencida) return;

    setErrorEnvio(null);

    const resultado = await enviarMensaje(textoLimpio);

    if (resultado.ok) {
      setTexto('');
    } else {
      setErrorEnvio(resultado.error ?? 'No se pudo enviar el mensaje');
    }
  };

  const handleCambiarModo = async (modo: ModoConversacion) => {
    setCambiandoModo(true);

    const resultado = await cambiarModo(modo);

    if (!resultado.ok) {
      setErrorEnvio(resultado.error ?? 'No se pudo cambiar el modo');
    }

    setCambiandoModo(false);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Encabezado */}
      <div className="h-16 px-4 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {onVolver && (
            <button
              type="button"
              onClick={onVolver}
              className="lg:hidden p-1.5 rounded-md text-gray-500 hover:bg-gray-100"
              aria-label="Volver a la lista"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
          )}

          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {nombreCliente(conversacionResumen)}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {conversacionResumen.cliente?.telefono || conversacionResumen.chat_id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span
            className={clsx(
              'px-2.5 py-1 rounded-full text-xs font-medium',
              modoActual === 'humano' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
            )}
          >
            {modoActual === 'humano' ? 'Modo Humano' : 'Modo Bot'}
          </span>

          {puedeEnviar && (
            <button
              type="button"
              disabled={cambiandoModo}
              onClick={() => handleCambiarModo(modoActual === 'humano' ? 'bot' : 'humano')}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {modoActual === 'humano' ? 'Reactivar bot' : 'Pasar a humano'}
            </button>
          )}
        </div>
      </div>

      {/* Historial de mensajes */}
      <div ref={listaRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {loading && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            <p className="mt-3 text-sm">Cargando conversación...</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {!loading && !error && mensajes.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 text-sm">
            Esta conversación todavía no tiene mensajes.
          </div>
        )}

        {!loading &&
          !error &&
          mensajes.map((mensaje) => <MensajeBubble key={mensaje.id} mensaje={mensaje} />)}
      </div>

      {/* Compositor */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
        {ventanaVencida && (
          <div className="mb-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            Pasaron más de 24 horas desde el último mensaje del cliente. No se puede
            responder por WhatsApp hasta que el cliente vuelva a escribir.
          </div>
        )}

        {!ventanaVencida && errorEnvio && (
          <div className="mb-2 px-3 py-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs">
            {errorEnvio}
          </div>
        )}

        {!puedeEnviar ? (
          <p className="text-xs text-gray-400 text-center py-2">
            No tenés permisos para enviar mensajes.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, TEXTO_MAX))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleEnviar();
                }
              }}
              disabled={ventanaVencida || enviando}
              placeholder={
                ventanaVencida ? 'Ventana de 24 horas vencida' : 'Escribí un mensaje...'
              }
              rows={1}
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
            />

            <button
              type="button"
              onClick={handleEnviar}
              disabled={ventanaVencida || enviando || !texto.trim()}
              className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              aria-label="Enviar mensaje"
            >
              {enviando ? (
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <PaperAirplaneIcon className="h-5 w-5" />
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
