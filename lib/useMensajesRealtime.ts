'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabaseClient';
import type {
  ApiResponse,
  ConversacionResumen,
  EnviarMensajeResponse,
  HistorialMensajesResponse,
  MensajeHistorial,
  ModoConversacion,
} from '@/types/api';

const DEBOUNCE_REFRESCO_MS = 400;

/**
 * Lista de conversaciones de la bandeja de WhatsApp, con actualización
 * en tiempo real ante cambios en la tabla `conversacion` (nuevos chats,
 * mensajes no leídos, cambios de modo, etc.).
 */
export function useConversacionesRealtime() {
  const [conversaciones, setConversaciones] = useState<ConversacionResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeDisponible, setRealtimeDisponible] = useState(true);

  const cargarConversaciones = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/conversaciones');
      const payload: ApiResponse<{ conversaciones: ConversacionResumen[] }> =
        await response.json();

      if (!response.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Error al cargar las conversaciones');
      }

      setConversaciones(payload.data.conversaciones);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Error desconocido al cargar conversaciones'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /** Aplica un cambio puntual (modo, no_leidos) sin esperar al round-trip de Realtime. */
  const actualizarConversacion = useCallback(
    (id: number, patch: Partial<ConversacionResumen>) => {
      setConversaciones((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  useEffect(() => {
    let activo = true;
    let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

    cargarConversaciones();

    const refrescarConDebounce = () => {
      if (debounceTimeout) clearTimeout(debounceTimeout);

      debounceTimeout = setTimeout(() => {
        if (activo) cargarConversaciones();
      }, DEBOUNCE_REFRESCO_MS);
    };

    const channel: RealtimeChannel = supabase
      .channel('mensajes-conversaciones-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversacion' },
        () => {
          if (!activo) return;
          refrescarConDebounce();
        }
      )
      .subscribe((status) => {
        if (!activo) return;

        // Si el canal falla, la lista sigue funcionando con la carga inicial
        // (y el usuario puede refrescar manualmente); no rompe la interfaz.
        setRealtimeDisponible(status === 'SUBSCRIBED');
      });

    return () => {
      activo = false;
      if (debounceTimeout) clearTimeout(debounceTimeout);
      supabase.removeChannel(channel);
    };
  }, [cargarConversaciones]);

  return {
    conversaciones,
    loading,
    error,
    realtimeDisponible,
    recargar: cargarConversaciones,
    actualizarConversacion,
  };
}

interface ConversacionDetalle {
  id: number;
  chat_id: string;
  modo: ModoConversacion;
  no_leidos: number;
  ultimo_mensaje_cliente_at: string | null;
  cliente: ConversacionResumen['cliente'];
}

interface EnviarMensajeResultado {
  ok: boolean;
  error?: string;
}

/**
 * Historial y acciones de una conversación individual: carga de mensajes,
 * envío, cambio de modo y marcado de lectura, con actualización en tiempo
 * real de los mensajes nuevos y los cambios de modo de esa conversación.
 */
export function useConversacionDetalle(
  conversacionId: number | null,
  onConversacionCambiada?: (id: number, patch: Partial<ConversacionResumen>) => void
) {
  const [conversacion, setConversacion] = useState<ConversacionDetalle | null>(null);
  const [mensajes, setMensajes] = useState<MensajeHistorial[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const onConversacionCambiadaRef = useRef(onConversacionCambiada);
  onConversacionCambiadaRef.current = onConversacionCambiada;

  const agregarMensaje = useCallback((mensaje: MensajeHistorial) => {
    setMensajes((prev) => {
      if (prev.some((m) => m.id === mensaje.id)) {
        return prev;
      }

      return [...prev, mensaje];
    });
  }, []);

  useEffect(() => {
    let activo = true;

    if (!conversacionId) {
      setConversacion(null);
      setMensajes([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const response = await fetch(`/api/conversaciones/${conversacionId}/mensajes`);
        const payload: ApiResponse<HistorialMensajesResponse> = await response.json();

        if (!response.ok || !payload.success || !payload.data) {
          throw new Error(payload.error || 'Error al cargar el historial de la conversación');
        }

        if (!activo) return;

        setConversacion(payload.data.conversacion);
        setMensajes(payload.data.mensajes);
      } catch (err) {
        if (!activo) return;

        setError(
          err instanceof Error ? err.message : 'Error desconocido al cargar la conversación'
        );
      } finally {
        if (activo) setLoading(false);
      }
    })();

    const channel: RealtimeChannel = supabase
      .channel(`mensajes-conversacion-${conversacionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensaje',
          filter: `id_conversacion=eq.${conversacionId}`,
        },
        (payload) => {
          if (!activo) return;
          agregarMensaje(payload.new as MensajeHistorial);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversacion',
          filter: `id=eq.${conversacionId}`,
        },
        (payload) => {
          if (!activo) return;

          const fila = payload.new as {
            modo: ModoConversacion;
            no_leidos: number;
            ultimo_mensaje_cliente_at: string | null;
          };

          setConversacion((prev) =>
            prev
              ? {
                  ...prev,
                  modo: fila.modo,
                  no_leidos: fila.no_leidos,
                  ultimo_mensaje_cliente_at: fila.ultimo_mensaje_cliente_at,
                }
              : prev
          );
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(channel);
    };
  }, [conversacionId, agregarMensaje]);

  const enviarMensaje = useCallback(
    async (texto: string): Promise<EnviarMensajeResultado> => {
      if (!conversacionId || enviando) {
        return { ok: false, error: 'No hay una conversación seleccionada' };
      }

      setEnviando(true);

      try {
        const response = await fetch('/api/mensajes/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_conversacion: conversacionId, texto }),
        });

        const payload: ApiResponse<EnviarMensajeResponse> = await response.json();

        // El backend persiste el mensaje aunque falle el envío a Meta (estado
        // "fallido"), así que lo reflejamos igual en el historial si vino con datos.
        if (payload.data) {
          agregarMensaje({
            id: payload.data.id_mensaje,
            direccion: 'saliente',
            origen: 'empleado',
            texto,
            estado: payload.data.estado,
            error_detalle: response.ok ? null : payload.error ?? null,
            wa_message_id: payload.data.wa_message_id ?? null,
            created_at: new Date().toISOString(),
          });

          setConversacion((prev) => (prev ? { ...prev, modo: 'humano' } : prev));
          onConversacionCambiadaRef.current?.(conversacionId, { modo: 'humano' });
        }

        if (!response.ok || !payload.success) {
          const mensajeError = payload.error || 'No se pudo enviar el mensaje';

          return { ok: false, error: mensajeError };
        }

        return { ok: true };
      } catch (err) {
        const mensajeError =
          err instanceof Error ? err.message : 'Error de red al enviar el mensaje';

        return { ok: false, error: mensajeError };
      } finally {
        setEnviando(false);
      }
    },
    [conversacionId, enviando, agregarMensaje]
  );

  const cambiarModo = useCallback(
    async (modo: ModoConversacion): Promise<EnviarMensajeResultado> => {
      if (!conversacionId) {
        return { ok: false, error: 'No hay una conversación seleccionada' };
      }

      try {
        const response = await fetch(`/api/conversaciones/${conversacionId}/modo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modo }),
        });

        const payload: ApiResponse<{ modo: ModoConversacion }> = await response.json();

        if (!response.ok || !payload.success || !payload.data) {
          const mensajeError = payload.error || 'No se pudo cambiar el modo';

          return { ok: false, error: mensajeError };
        }

        setConversacion((prev) => (prev ? { ...prev, modo: payload.data!.modo } : prev));
        onConversacionCambiadaRef.current?.(conversacionId, { modo: payload.data.modo });

        return { ok: true };
      } catch (err) {
        const mensajeError =
          err instanceof Error ? err.message : 'Error de red al cambiar el modo';

        return { ok: false, error: mensajeError };
      }
    },
    [conversacionId]
  );

  const marcarLeido = useCallback(async () => {
    if (!conversacionId) return;

    try {
      const response = await fetch(`/api/conversaciones/${conversacionId}/leer`, {
        method: 'POST',
      });

      const payload: ApiResponse<{ no_leidos: number }> = await response.json();

      if (response.ok && payload.success && payload.data) {
        setConversacion((prev) =>
          prev ? { ...prev, no_leidos: payload.data!.no_leidos } : prev
        );
        onConversacionCambiadaRef.current?.(conversacionId, {
          no_leidos: payload.data.no_leidos,
        });
      }
    } catch {
      // Marcar como leído es una acción secundaria: si falla, no rompemos la
      // vista del chat ni mostramos un error bloqueante.
    }
  }, [conversacionId]);

  return {
    conversacion,
    mensajes,
    loading,
    error,
    enviando,
    enviarMensaje,
    cambiarModo,
    marcarLeido,
  };
}
