'use client';

import { useState, useEffect } from 'react';
import { obtenerTiempoRestanteReserva } from '@/app/api/reservas/actions';

interface TiempoRestanteProps {
  idReserva: number;
  estadoReserva: string;
  onVencimiento?: () => void;
}

export const TiempoRestante = ({ idReserva, estadoReserva, onVencimiento }: TiempoRestanteProps) => {
  const [tiempoRestante, setTiempoRestante] = useState<{
    minutosRestantes: number;
    segundosRestantes: number;
    vencida: boolean;
    porcentajeTranscurrido: number;
  } | null>(null);

  useEffect(() => {
    if (estadoReserva !== 'pendiente') {
      return;
    }

    const actualizarTiempo = async () => {
      try {
        const tiempo = await obtenerTiempoRestanteReserva(idReserva);
        setTiempoRestante(tiempo);
        
        if (tiempo?.vencida && onVencimiento) {
          onVencimiento();
        }
      } catch {
        // Error silencioso en obtención de tiempo restante
      }
    };

    actualizarTiempo();

    const intervalo = setInterval(actualizarTiempo, 1000);

    return () => clearInterval(intervalo);
  }, [idReserva, estadoReserva, onVencimiento]);

  if (estadoReserva !== 'pendiente' || !tiempoRestante) {
    return null;
  }

  if (tiempoRestante.vencida) {
    return (
      <div className="flex items-center space-x-1">
        <span className="text-xs text-red-600 font-medium">⏰ Vencida</span>
      </div>
    );
  }

  const minutos = Math.floor(tiempoRestante.segundosRestantes / 60);
  const segundos = tiempoRestante.segundosRestantes % 60;

  // Determinar color según tiempo restante
  const getColorClass = () => {
    if (minutos < 1) return 'text-red-600'; // Menos de 1 minuto - rojo
    if (minutos < 2) return 'text-orange-600'; // Menos de 2 minutos - naranja
    if (minutos < 3) return 'text-yellow-600'; // Menos de 3 minutos - amarillo
    return 'text-blue-600'; // Más de 3 minutos - azul
  };

  // Determinar color de la barra de progreso
  const getProgressColorClass = () => {
    if (minutos < 1) return 'bg-red-500';
    if (minutos < 2) return 'bg-orange-500';
    if (minutos < 3) return 'bg-yellow-500';
    return 'bg-blue-500';
  };

  return (
    <div className="flex flex-col space-y-1">
      <div className="flex items-center space-x-1">
        <span className={`text-xs ${getColorClass()} font-medium`}>
          ⏱️ {minutos}:{segundos.toString().padStart(2, '0')}
        </span>
      </div>
      
      {/* Barra de progreso */}
      <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={`h-full ${getProgressColorClass()} transition-all duration-1000 ease-linear`}
          style={{ width: `${100 - (tiempoRestante.segundosRestantes / 600) * 100}%` }}
        />
      </div>
      
      <span className="text-xs text-gray-500">
        {minutos === 0 ? 'Último minuto' : `${minutos} min restantes`}
      </span>
    </div>
  );
};