'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

import { obtenerPermisosMensajes } from '@/app/api/mensajes/actions';
import { useConversacionesModoHumanoCount } from '@/lib/useMensajesRealtime';

// Indicador superior de conversaciones de WhatsApp en modo humano: recuerda al
// empleado que hay chats que el bot no está respondiendo (para no olvidarse de
// volverlos a modo bot). Solo se muestra si el usuario tiene permiso
// mensajes.ver; se oculta del todo si el conteo es 0.
export default function NotificacionModoHumano() {
  const [puedeVer, setPuedeVer] = useState(false);
  const { count, realtimeDisponible } = useConversacionesModoHumanoCount();

  useEffect(() => {
    let activo = true;

    obtenerPermisosMensajes()
      .then((permisos) => {
        if (activo) setPuedeVer(permisos.puedeVer);
      })
      .catch(() => {
        if (activo) setPuedeVer(false);
      });

    return () => {
      activo = false;
    };
  }, []);

  if (!puedeVer || count <= 0) return null;

  return (
    <Link
      href="/mensajes"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold hover:bg-amber-200 transition-colors"
      title={
        realtimeDisponible
          ? 'Conversaciones en modo humano: no olvides volverlas a modo bot'
          : 'Conversaciones en modo humano (actualización en tiempo real no disponible)'
      }
    >
      <ChatBubbleLeftRightIcon className="h-4 w-4" />
      <span>
        {count} {count === 1 ? 'conversación' : 'conversaciones'} en modo humano
      </span>
    </Link>
  );
}
