import { useEffect } from 'react';
import { supabase } from './supabaseClient';
import notifications from './notifications';

const clienteCache = new Map<number, string>();
const recursoCache = new Map<number, string>();

async function obtenerNombreCliente(idCliente: unknown) {
  const clienteId = Number(idCliente);

  if (!Number.isFinite(clienteId)) {
    return 'Cliente';
  }

  const cacheado = clienteCache.get(clienteId);
  if (cacheado) {
    return cacheado;
  }

  const { data } = await supabase
    .from('cliente')
    .select('nombre, apellido')
    .eq('id_cliente', clienteId)
    .maybeSingle();

  const nombre = data ? `${data.nombre} ${data.apellido || ''}`.trim() : `Cliente #${clienteId}`;
  clienteCache.set(clienteId, nombre);
  return nombre;
}

async function obtenerNombreRecurso(idRecurso: unknown) {
  const recursoId = Number(idRecurso);

  if (!Number.isFinite(recursoId)) {
    return 'Recurso';
  }

  const cacheado = recursoCache.get(recursoId);
  if (cacheado) {
    return cacheado;
  }

  const { data } = await supabase
    .from('recurso')
    .select('nombre')
    .eq('id_recurso', recursoId)
    .maybeSingle();

  const nombre = data?.nombre || `Recurso #${recursoId}`;
  recursoCache.set(recursoId, nombre);
  return nombre;
}

export function useReservasRealtime() {
  useEffect(() => {
    const channel = supabase
      .channel('reservas-tracker-v2')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reserva',
        },
        async (payload) => {

          if (payload.eventType === 'INSERT') {
            const reserva = payload.new as Record<string, unknown>;
            const estado = reserva.estado_reserva as string;
            const horario = reserva.hora_inicio && reserva.hora_fin
              ? ` (${reserva.hora_inicio} - ${reserva.hora_fin})`
              : '';

            try {
              const [clienteNombre, recursoNombre] = await Promise.all([
                obtenerNombreCliente(reserva.id_cliente),
                obtenerNombreRecurso(reserva.id_recurso)
              ]);

              if (estado === 'pendiente') {
                notifications.warning(`⏳ Reserva pendiente: ${clienteNombre} - ${recursoNombre}${horario}`, { duration: 6000 });
              } else if (estado === 'confirmada') {
                notifications.success(`✅ Reserva confirmada: ${clienteNombre} - ${recursoNombre}${horario}`, { duration: 6000 });
              } else {
                notifications.success(`📅 Nueva reserva: ${clienteNombre} - ${recursoNombre}${horario}`, { duration: 6000 });
              }
            } catch {
              const clienteNombre = `Cliente #${reserva.id_cliente}`;
              const recursoNombre = `Recurso #${reserva.id_recurso}`;

              if (estado === 'pendiente') {
                notifications.warning(`⏳ Reserva pendiente: ${clienteNombre} - ${recursoNombre}${horario}`, { duration: 6000 });
              } else if (estado === 'confirmada') {
                notifications.success(`✅ Reserva confirmada: ${clienteNombre} - ${recursoNombre}${horario}`, { duration: 6000 });
              } else {
                notifications.success(`📅 Nueva reserva: ${clienteNombre} - ${recursoNombre}${horario}`, { duration: 6000 });
              }
            }
          }

          if (payload.eventType === 'UPDATE') {
            const reservaAnterior = payload.old as Record<string, unknown>;
            const reservaNueva = payload.new as Record<string, unknown>;

            if (reservaAnterior.estado_reserva !== reservaNueva.estado_reserva) {
              const estado = reservaNueva.estado_reserva as string;
              
              if (estado === 'cancelada') {
                notifications.warning(`❌ Reserva #${reservaNueva.id_reserva} cancelada`, {
                  duration: 5000
                });
              } else if (estado === 'confirmada') {
                notifications.success(`✅ Reserva #${reservaNueva.id_reserva} confirmada`, {
                  duration: 5000
                });
              } else if (estado === 'pendiente') {
                notifications.warning(`⏳ Reserva #${reservaNueva.id_reserva} pendiente de pago`, {
                  duration: 5000
                });
              } else {
                notifications.info(`📝 Reserva #${reservaNueva.id_reserva}: ${estado}`, {
                  duration: 4000
                });
              }
            }
          }

          if (payload.eventType === 'DELETE') {
            const reserva = payload.old as Record<string, unknown>;
            notifications.warning(`🗑️ Reserva #${reserva.id_reserva} eliminada`, {
              duration: 4000
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
