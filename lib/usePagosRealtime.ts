import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';
import notifications from './notifications';

export interface Pago {
  id_pago: number;
  id_reserva: number;
  monto: number;
  estado_pago: 'aprobado' | 'pendiente' | 'cancelado' | 'desconocido';
  mp_id?: string | null;
  fecha_pago: string;
}

interface UsePagosRealtimeResult {
  pagos: Pago[];
  loading: boolean;
  error: string | null;
  crearPago: (
    pago: Omit<Pago, 'id_pago' | 'fecha_pago'>
  ) => Promise<void>;
  actualizarPago: (
    id_pago: number,
    data: { estado_pago: string; mp_id?: string }
  ) => Promise<void>;
}

export function usePagosRealtime(): UsePagosRealtimeResult {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Agrega o actualiza un pago sin permitir duplicados.
   *
   * Si ya existe un pago con el mismo id_pago,
   * lo reemplaza por la versión más reciente.
   */
  const upsertPago = useCallback((pagoNuevo: Pago) => {
    setPagos(prev => {
      const sinDuplicado = prev.filter(
        pago => pago.id_pago !== pagoNuevo.id_pago
      );

      return [pagoNuevo, ...sinDuplicado];
    });
  }, []);

  /**
   * Carga todos los pagos desde la API.
   */
  const loadPagos = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch('/api/pagos');

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Error ${response.status}: ${
            errorText || 'Error al cargar pagos'
          }`
        );
      }

      const data: Pago[] = await response.json();

      /**
       * También limpiamos duplicados provenientes de la API.
       * La base de datos debería garantizar IDs únicos,
       * pero esto protege al estado del frontend.
       */
      const pagosUnicos = Array.from(
        new Map(
          data.map(pago => [pago.id_pago, pago])
        ).values()
      );

      setPagos(pagosUnicos);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Error desconocido al cargar pagos';

      setError(
        `${errorMessage}. Verifica que la tabla 'pago' exista en Supabase.`
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Crear pago.
   */
  const crearPago = useCallback(
    async (
      nuevoPago: Omit<Pago, 'id_pago' | 'fecha_pago'>
    ) => {
      try {
        setError(null);

        const response = await fetch('/api/pagos', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nuevoPago),
        });

        if (!response.ok) {
          const errorData = await response.json();

          notifications.error(
            errorData.error || 'Error al crear pago'
          );

          throw new Error(
            errorData.error || 'Error al crear pago'
          );
        }

        const pagoCreado: Pago = await response.json();

        /**
         * Lo agregamos inmediatamente para que la UI
         * no tenga que esperar al evento Realtime.
         *
         * Si Realtime vuelve a enviar el mismo INSERT,
         * upsertPago() evita el duplicado.
         */
        upsertPago(pagoCreado);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Error al crear pago';

        setError(errorMessage);

        if (
          !err?.toString().includes('Error al crear pago')
        ) {
          notifications.error(
            'Error inesperado al crear el pago'
          );
        }

        throw err;
      }
    },
    [upsertPago]
  );

  /**
   * Actualizar pago.
   */
  const actualizarPago = useCallback(
    async (
      id_pago: number,
      data: {
        estado_pago: string;
        mp_id?: string;
      }
    ) => {
      try {
        setError(null);

        const response = await fetch('/api/pagos', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id_pago,
            ...data,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();

          notifications.error(
            errorData.error || 'Error al actualizar pago'
          );

          throw new Error(
            errorData.error || 'Error al actualizar pago'
          );
        }

        const pagoActualizado: Pago =
          await response.json();

        /**
         * Actualizamos inmediatamente el pago.
         *
         * El evento UPDATE de Realtime también puede llegar,
         * pero upsertPago() evita duplicados.
         */
        upsertPago(pagoActualizado);
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Error al actualizar pago';

        setError(errorMessage);

        if (
          !err?.toString().includes(
            'Error al actualizar pago'
          )
        ) {
          notifications.error(
            'Error inesperado al actualizar el pago'
          );
        }

        throw err;
      }
    },
    [upsertPago]
  );

  /**
   * Suscripción a Supabase Realtime.
   */
  useEffect(() => {
    let activo = true;

    /**
     * Carga inicial.
     */
    loadPagos();

    const channel = supabase
      .channel('pagos-realtime-v3')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pago',
        },
        payload => {
          /**
           * Si el componente ya se desmontó,
           * ignoramos eventos pendientes.
           */
          if (!activo) return;

          if (payload.eventType === 'INSERT') {
            const nuevoPago = payload.new as Pago;

            const monto = nuevoPago.monto
              ? `$${nuevoPago.monto.toLocaleString()}`
              : '';

            notifications.success(
              `💰 Nuevo pago recibido ${monto}`,
              {
                duration: 6000,
                style: {
                  background: '#059669',
                  color: '#fff',
                  fontWeight: 'bold',
                },
              }
            );

            /**
             * IMPORTANTE:
             *
             * No hacemos:
             *
             * setPagos(prev => [...prev, nuevoPago])
             *
             * porque el POST de crearPago() posiblemente
             * ya lo agregó.
             *
             * upsertPago() garantiza que exista UNA sola
             * instancia del pago.
             */
            upsertPago(nuevoPago);
          }

          if (payload.eventType === 'UPDATE') {
            const pagoActualizado =
              payload.new as Pago;

            const estadoEmoji =
              pagoActualizado.estado_pago === 'aprobado'
                ? '✅'
                : pagoActualizado.estado_pago === 'cancelado'
                ? '❌'
                : '⏳';

            if (
              pagoActualizado.estado_pago ===
              'aprobado'
            ) {
              notifications.success(
                `${estadoEmoji} Pago aprobado - $${pagoActualizado.monto?.toLocaleString()}`,
                {
                  duration: 5000,
                }
              );
            } else {
              notifications.info(
                `${estadoEmoji} Pago ${pagoActualizado.estado_pago}`,
                {
                  duration: 4000,
                }
              );
            }

            upsertPago(pagoActualizado);
          }

          if (payload.eventType === 'DELETE') {
            const pagoEliminado =
              payload.old as Pago;

            setPagos(prev =>
              prev.filter(
                pago =>
                  pago.id_pago !==
                  pagoEliminado.id_pago
              )
            );
          }
        }
      )
      .subscribe();

    /**
     * Cleanup.
     */
    return () => {
      activo = false;
      supabase.removeChannel(channel);
    };
  }, [loadPagos, upsertPago]);

  return {
    pagos,
    loading,
    error,
    crearPago,
    actualizarPago,
  };
}
