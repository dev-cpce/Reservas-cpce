'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { Reserva, Recurso, NuevaReservaRecursoInput } from '@/types';
import {
  DURACIONES_VALIDAS_MINUTOS,
  esDuracionValida,
  calcularHoraFinPorDuracion,
  haySolapamientoDeHorarios,
  reservaBloqueaRecurso,
  calcularFechaExpiracionPago,
  horaAMinutos
} from '@/lib/recursoDisponibilidad';

function obtenerFechaLocal(fecha: Date): string {
  return fecha.getFullYear() + '-' + 
         String(fecha.getMonth() + 1).padStart(2, '0') + '-' + 
         String(fecha.getDate()).padStart(2, '0');
}

async function cargarRelacionesReservas(
  supabase: ReturnType<typeof createServerComponentClient>,
  reservas: Array<{ id_cliente: number; id_cancha: number; id_recurso?: number | null }>
) {
  const clientes = new Map<number, { nombre: string; apellido: string | null }>();
  const canchas = new Map<number, { nombre: string }>();
  // Nuevo (Paso 3): resuelve el nombre del recurso para las reservas ya migradas.
  const recursos = new Map<number, { nombre: string }>();

  // id_cancha/id_recurso pueden ser NULL (Number(null) === 0 es finito, por eso se
  // excluyen null/undefined explícitamente en vez de confiar solo en Number.isFinite).
  const esIdValido = (id: unknown): id is number => typeof id === 'number' && Number.isFinite(id);

  const idsCliente = Array.from(new Set(reservas.map(reserva => reserva.id_cliente).filter(esIdValido)));
  const idsCancha = Array.from(new Set(reservas.map(reserva => reserva.id_cancha).filter(esIdValido)));
  const idsRecurso = Array.from(new Set(reservas.map(reserva => reserva.id_recurso).filter(esIdValido)));

  if (idsCliente.length > 0) {
    const { data } = await supabase
      .from('cliente')
      .select('id_cliente, nombre, apellido')
      .in('id_cliente', idsCliente);

    data?.forEach(cliente => {
      clientes.set(cliente.id_cliente, {
        nombre: cliente.nombre,
        apellido: cliente.apellido
      });
    });
  }

  if (idsCancha.length > 0) {
    const { data } = await supabase
      .from('cancha')
      .select('id_cancha, nombre')
      .in('id_cancha', idsCancha);

    data?.forEach(cancha => {
      canchas.set(cancha.id_cancha, {
        nombre: cancha.nombre
      });
    });
  }

  if (idsRecurso.length > 0) {
    const { data } = await supabase
      .from('recurso')
      .select('id_recurso, nombre')
      .in('id_recurso', idsRecurso);

    data?.forEach(recurso => {
      recursos.set(recurso.id_recurso, {
        nombre: recurso.nombre
      });
    });
  }

  return { clientes, canchas, recursos };
}

const verificarConectividad = async (supabase: ReturnType<typeof createServerComponentClient>) => {
  try {
    const { data: session, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session.session) {
      throw new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.');
    }
    return true;
  } catch (error) {
    throw error;
  }
};

const validarHoraReserva = (horaInicio: string, horaFin: string) => {
  if (horaFin === '00:00') {
    return true;
  }
  
  const inicio = new Date(`1970-01-01T${horaInicio}:00`);
  const fin = new Date(`1970-01-01T${horaFin}:00`);
  
  if (inicio >= fin) {
    throw new Error('La hora de fin debe ser posterior a la hora de inicio');
  }
  const diferenciaMs = fin.getTime() - inicio.getTime();
  const diferenciaHoras = diferenciaMs / (1000 * 60 * 60);
  
  if (diferenciaHoras < 1) {
    throw new Error('La reserva debe ser de al menos 1 hora');
  }
  
  return true;
};

// Función para verificar disponibilidad (sin conflictos)
const verificarDisponibilidad = async (
  fecha: string, 
  horaInicio: string, 
  horaFin: string, 
  idCancha: number, 
  idReserva?: number
) => {
  const supabase = createServerComponentClient({ cookies });
  
  // Validar horas
  validarHoraReserva(horaInicio, horaFin);

  let query = supabase
    .from('reserva')
    .select('*');
    
  // Intentar diferentes nombres de columna para cancha
  try {
    query = query.eq('id_cancha', idCancha);
  } catch {
    try {
      query = query.eq('cancha_id', idCancha);
    } catch {
    }
  }

  try {
    query = query.eq('fecha_reserva', fecha);
  } catch {
    // Si no funciona, intentar con 'fecha' como fallback
    try {
      query = query.eq('fecha', fecha);
    } catch {
      // Si no funciona ninguno, continuar sin filtro de fecha
    }
  }
    
  // Filtrar por estados que no sean cancelados
  query = query.neq('estado_reserva', 'cancelada');
  
  // Si estamos actualizando, excluir la reserva actual
  if (idReserva) {
    query = query.neq('id_reserva', idReserva);
  }
  
  const { data: reservasExistentes, error } = await query;
  
  if (error) {
    throw new Error(`Error al verificar disponibilidad: ${error.message}`);
  }

  // Función para normalizar formatos de hora (remover segundos si existen)
  const normalizarHora = (hora: string) => {
    if (hora.includes(':')) {
      const partes = hora.split(':');
      return `${partes[0]}:${partes[1]}`;  // Solo HH:MM
    }
    return hora;
  };

  if (reservasExistentes && reservasExistentes.length > 0) {
    const conflictos = reservasExistentes.filter(reserva => {
      // Convertir horas a minutos desde medianoche para comparación correcta
      const horaAMinutos = (hora: string): number => {
        const [hh, mm] = hora.split(':').map(Number);
        // Si es 00:00, considerarlo como 24:00 (1440 minutos)
        if (hh === 0 && mm === 0) {
          return 24 * 60; // 1440 minutos = medianoche del día siguiente
        }
        return hh * 60 + mm;
      };
      
      const inicioReservaExistente = normalizarHora(reserva.hora_inicio);
      const finReservaExistente = normalizarHora(reserva.hora_fin);
      const inicioNuevaReserva = normalizarHora(horaInicio);
      const finNuevaReserva = normalizarHora(horaFin);
      
      // Convertir a minutos para comparación numérica correcta
      const inicioExistenteMin = horaAMinutos(inicioReservaExistente);
      const finExistenteMin = horaAMinutos(finReservaExistente);
      const inicioNuevoMin = horaAMinutos(inicioNuevaReserva);
      const finNuevoMin = horaAMinutos(finNuevaReserva);

      // Dos intervalos se solapan si: max(inicio1, inicio2) < min(fin1, fin2)
      const inicioSolapamiento = Math.max(inicioNuevoMin, inicioExistenteMin);
      const finSolapamiento = Math.min(finNuevoMin, finExistenteMin);
      const hayConflicto = inicioSolapamiento < finSolapamiento;

      return hayConflicto;
    });
    
    if (conflictos.length > 0) {
      const conflictoDetalle = conflictos.map(c => 
        `${normalizarHora(c.hora_inicio)}-${normalizarHora(c.hora_fin)}`
      ).join(', ');
      
      throw new Error(`Conflicto de horarios: Ya existe una reserva en ${conflictoDetalle}. El horario ${normalizarHora(horaInicio)}-${normalizarHora(horaFin)} se solapa con esta reserva existente.`);
    }
  }
  
  return true;
};

// Obtener reservas existentes para una cancha en una fecha específica
export async function obtenerReservasPorFechaYCancha(fecha: string, idCancha: number) {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    const { data, error } = await supabase
      .from('reserva')
      .select('hora_inicio, hora_fin, estado_reserva')
      .eq('fecha_reserva', fecha)
      .eq('id_cancha', idCancha)
      .in('estado_reserva', ['confirmada', 'pendiente']); // Solo reservas activas
    
    if (error) {
            return [];
    }

    return data || [];
  } catch {
        return [];
  }
}

// Función para calcular el costo total de la reserva (no se guarda en BD)
export const calcularCostoReserva = async (
  idCancha: number, 
  horaInicio: string, 
  horaFin: string
): Promise<number> => {
  const supabase = createServerComponentClient({ cookies });
  
  // Obtener la tarifa de la cancha
  const { data: cancha, error } = await supabase
    .from('cancha')
    .select('tarifa_hora')
    .eq('id_cancha', idCancha)
    .single();
  
  if (error || !cancha) {
        return 0;
  }
  
  // Calcular la duración en horas (manejar reservas que terminan a las 00:00)
  let diferenciaHoras: number;
  
  if (horaFin === '00:00') {
    // Caso especial: reservas que terminan a medianoche (cruzan al día siguiente)
    const inicioHora = parseInt(horaInicio.split(':')[0]);
    diferenciaHoras = 24 - inicioHora; // Ej: 22:00 a 00:00 = 24 - 22 = 2 horas
  } else {
    const inicio = new Date(`1970-01-01T${horaInicio}:00`);
    const fin = new Date(`1970-01-01T${horaFin}:00`);
    const diferenciaMs = fin.getTime() - inicio.getTime();
    diferenciaHoras = diferenciaMs / (1000 * 60 * 60);
  }
  
  // Calcular el costo total
  const costoTotal = Math.round(diferenciaHoras * cancha.tarifa_hora * 100) / 100;
  
  return costoTotal;
};

// Obtener todas las reservas
export async function obtenerReservas() {
  try {
    const supabase = createServerComponentClient({ cookies });
    await verificarConectividad(supabase);
    const { data: reservas, error } = await supabase
      .from('reserva')
      .select('*');
      
    if (error) {
            if (error.message.includes('relation') && error.message.includes('does not exist')) {
        throw new Error('La tabla "reserva" no existe en la base de datos. Por favor, crea la estructura de la base de datos.');
      }
      
      throw new Error('Error al cargar las reservas: ' + error.message);
    }

    const filas = reservas || [];
    const { clientes, canchas, recursos } = await cargarRelacionesReservas(supabase, filas);

    return filas.map(reserva => ({
      ...reserva,
      cliente: clientes.get(reserva.id_cliente) || null,
      cancha: canchas.get(reserva.id_cancha) || null,
      recurso: recursos.get(reserva.id_recurso) || null
    }));
    
  } catch (error) {
        throw new Error('Error al cargar las reservas: ' + (error as Error).message);
  }
}

// Crear una nueva reserva
export async function crearReserva(reserva: Omit<Reserva, 'id_reserva'>) {
  const supabase = createServerComponentClient({ cookies });
  

  
  // Verificar disponibilidad usando el nombre correcto de campo
  await verificarDisponibilidad(
    reserva.fecha_reserva || reserva.fecha || '',
    reserva.hora_inicio,
    reserva.hora_fin,
    reserva.id_cancha
  );
  
  // Calcular el costo de la reserva
  const costoReserva = await calcularCostoReserva(
    reserva.id_cancha,
    reserva.hora_inicio,
    reserva.hora_fin
  );
  
  const reservaParaInsertar = {
    fecha_reserva: reserva.fecha_reserva || reserva.fecha,
    hora_inicio: reserva.hora_inicio,
    hora_fin: reserva.hora_fin,
    estado_reserva: 'pendiente',
    id_cliente: reserva.id_cliente,
    id_cancha: reserva.id_cancha,
    costo_reserva: costoReserva
  };
  

  
  // Crear la reserva
  const { data, error } = await supabase
    .from('reserva')
    .insert(reservaParaInsertar)
    .select('id_reserva')
    .single();
  
  if (error) {
        throw new Error(`Error al crear la reserva: ${error.message}`);
  }
  
  revalidatePath('/reservas');
  return data.id_reserva;
}

// Actualizar una reserva existente
export async function actualizarReserva(
  id: number, 
  reserva: Omit<Reserva, 'id_reserva'>
) {
  const supabase = createServerComponentClient({ cookies });
  
  // Verificar disponibilidad usando el nombre correcto de campo
  await verificarDisponibilidad(
    reserva.fecha_reserva || reserva.fecha || '',
    reserva.hora_inicio,
    reserva.hora_fin,
    reserva.id_cancha,
    id
  );
  
  // Recalcular el costo si cambió la cancha o las horas
  const costoReserva = await calcularCostoReserva(
    reserva.id_cancha,
    reserva.hora_inicio,
    reserva.hora_fin
  );
  
  const reservaParaActualizar: Partial<{
    fecha_reserva: string;
    hora_inicio: string;
    hora_fin: string;
    estado_reserva: string;
    id_cliente: number;
    id_cancha: number;
    costo_reserva: number;
  }> = {};
  
  if (reserva.fecha_reserva || reserva.fecha) {
    reservaParaActualizar.fecha_reserva = reserva.fecha_reserva || reserva.fecha;
  }
  if (reserva.hora_inicio) reservaParaActualizar.hora_inicio = reserva.hora_inicio;
  if (reserva.hora_fin) reservaParaActualizar.hora_fin = reserva.hora_fin;
  if (reserva.estado_reserva) {
    reservaParaActualizar.estado_reserva = reserva.estado_reserva;
  }
  if (reserva.id_cliente) reservaParaActualizar.id_cliente = reserva.id_cliente;
  if (reserva.id_cancha) reservaParaActualizar.id_cancha = reserva.id_cancha;
  
  // Siempre actualizar el costo cuando se actualiza una reserva
  reservaParaActualizar.costo_reserva = costoReserva;
  

  
  // Actualizar la reserva
  const { error } = await supabase
    .from('reserva')
    .update(reservaParaActualizar)
    .eq('id_reserva', id);
  
  if (error) {
        throw new Error(`Error al actualizar la reserva: ${error.message}`);
  }
  
  revalidatePath('/reservas');
  return true;
}

// Eliminar una reserva
export async function eliminarReserva(id: number) {
  const supabase = createServerComponentClient({ cookies });
  
  const { error } = await supabase
    .from('reserva')
    .delete()
    .eq('id_reserva', id);
  
  if (error) {
        throw new Error('Error al eliminar la reserva');
  }
  
  revalidatePath('/reservas');
  return true;
}

// Cambiar el estado de una reserva
export async function cambiarEstadoReserva(id: number, estado: string) {
  const supabase = createServerComponentClient({ cookies });
  
  // Validar que el estado sea válido
  const estadosValidos = ['pendiente', 'confirmada', 'cancelada', 'completada'];
  if (!estadosValidos.includes(estado)) {
    throw new Error('Estado de reserva no válido');
  }
  
  const { error } = await supabase
    .from('reserva')
    .update({ estado_reserva: estado })
    .eq('id_reserva', id);
  
  if (error) {
        throw new Error('Error al cambiar el estado de la reserva');
  }
  
  revalidatePath('/reservas');
  return true;
}

// Buscar reservas
export async function buscarReservas(query: string) {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { data: reservas, error } = await supabase
      .from('reserva')
      .select('*');
      
    if (error) {
            throw new Error('Error al buscar reservas: ' + error.message);
    }

    const reservasFiltradas = (reservas || []).filter(reserva => {
      const queryLower = query.toLowerCase();
      return (
        (reserva.fecha_reserva && reserva.fecha_reserva.includes(query)) ||
        (reserva.fecha && reserva.fecha.includes(query)) ||  // fallback
        (reserva.id_reserva && reserva.id_reserva.toString().includes(query)) ||
        (reserva.observaciones && reserva.observaciones.toLowerCase().includes(queryLower))
      );
    });

    const { clientes, canchas, recursos } = await cargarRelacionesReservas(supabase, reservasFiltradas);

    return reservasFiltradas.map(reserva => ({
      ...reserva,
      cliente: clientes.get(reserva.id_cliente) || null,
      cancha: canchas.get(reserva.id_cancha) || null,
      recurso: recursos.get(reserva.id_recurso) || null
    }));
  } catch (error) {
        throw new Error('Error al buscar reservas: ' + (error as Error).message);
  }
}

// Función de prueba simple para verificar acceso a base de datos
export async function verificarBaseDatos() {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    // Verificar conectividad y sesión
    await verificarConectividad(supabase);
    
    const resultado = {
      cliente: { existe: false, estructura: null as string[] | null, error: null as string | null },
      reserva: { existe: false, estructura: null as string[] | null, error: null as string | null },
      cancha: { existe: false, estructura: null as string[] | null, error: null as string | null }
    };
    
    // Verificar tabla cliente
    try {
      const { data: clienteData, error: clienteError } = await supabase
        .from('cliente')
        .select('*')
        .limit(1);
      
      if (clienteError) {
        resultado.cliente.error = clienteError.message;
      } else {
        resultado.cliente.existe = true;
        resultado.cliente.estructura = clienteData?.[0] ? Object.keys(clienteData[0]) : [];
      }
    } catch (error) {
      resultado.cliente.error = (error as Error).message;
    }
    
    // Verificar tabla reserva
    try {
      const { data: reservaData, error: reservaError } = await supabase
        .from('reserva')
        .select('*')
        .limit(1);
      
      if (reservaError) {
        resultado.reserva.error = reservaError.message;
      } else {
        resultado.reserva.existe = true;
        resultado.reserva.estructura = reservaData?.[0] ? Object.keys(reservaData[0]) : [];
      }
    } catch (error) {
      resultado.reserva.error = (error as Error).message;
    }
    
    // Verificar tabla cancha
    try {
      const { data: canchaData, error: canchaError } = await supabase
        .from('cancha')
        .select('*')
        .limit(1);
      
      if (canchaError) {
        resultado.cancha.error = canchaError.message;
      } else {
        resultado.cancha.existe = true;
        resultado.cancha.estructura = canchaData?.[0] ? Object.keys(canchaData[0]) : [];
      }
    } catch (error) {
      resultado.cancha.error = (error as Error).message;
    }
    

    return { success: true, data: resultado, message: 'Diagnóstico completado' };
  } catch (error) {
        return { success: false, error: (error as Error).message };
  }
}

// Obtener clientes activos para el formulario
export async function obtenerClientesActivos() {
  try {
    const supabase = createServerComponentClient({ cookies });
    await verificarConectividad(supabase);

    const { data: clientes, error: clientesError } = await supabase
      .from('cliente')
      .select('*')
      .order('apellido', { ascending: true });
    
    if (clientesError) {
            // Si la tabla no existe, proporcionar un mensaje más específico
      if (clientesError.message.includes('relation') && clientesError.message.includes('does not exist')) {
        throw new Error('La tabla "cliente" no existe en la base de datos. Por favor, crea la estructura de la base de datos.');
      }
      
      throw new Error('Error al cargar los clientes: ' + clientesError.message);
    }
    
    // Filtrar clientes activos si existe el campo estado_cliente
    const clientesActivos = clientes?.filter(cliente => 
      !cliente.estado_cliente || cliente.estado_cliente === 'activo'
    ) || [];
    

    return clientesActivos;
  } catch (error) {
        throw new Error('Error al cargar los clientes activos: ' + (error as Error).message);
  }
}

// Obtener canchas disponibles para el formulario
export async function obtenerCanchasDisponibles() {
  try {
    const supabase = createServerComponentClient({ cookies });
    await verificarConectividad(supabase);

    const { data: canchas, error } = await supabase
      .from('cancha')
      .select('*');
    
    if (error) {
            // Si la tabla no existe, proporcionar un mensaje más específico
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        throw new Error('La tabla "cancha" no existe en la base de datos. Por favor, crea la estructura de la base de datos.');
      }
      
      throw new Error('Error al cargar las canchas: ' + error.message);
    }

    const canchasDisponibles = canchas?.filter(cancha => {
      const estado = cancha.estado?.toLowerCase();
      const estadosNoDisponibles = [
        'no disponible', 
        'en mantenimiento', 
        'mantenimiento',
        'fuera de servicio',
        'inactiva',
        'inactivo',
        'cerrada',
        'cerrado'
      ];
      if (estado && estadosNoDisponibles.includes(estado)) {
        return false;
      }
      if (!estado) return true;
      return estado === 'disponible' || estado === 'activa' || estado === 'activo';
    }) || [];

    const canchasOrdenadas = canchasDisponibles.sort((a, b) => {
      const nombreA = a.nombre || `Cancha ${a.id_cancha}`;
      const nombreB = b.nombre || `Cancha ${b.id_cancha}`;
      return nombreA.localeCompare(nombreB);
    });
    

    return canchasOrdenadas;
  } catch (error) {
        throw new Error('Error al cargar las canchas: ' + (error as Error).message);
  }
}

export async function obtenerEstadisticasDashboard() {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    // Obtener fecha actual en Buenos Aires (UTC-3)
    const ahoraUTC = new Date();
    const hoy = new Date(ahoraUTC.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const fechaHoy = obtenerFechaLocal(hoy);
    
    const inicioDelMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    
    const inicioMesStr = obtenerFechaLocal(inicioDelMes);
    const finMesStr = obtenerFechaLocal(finDelMes);
    const { data: reservasConfirmadas, error: errorConfirmadas } = await supabase
      .from('reserva')
      .select('id_reserva, estado_reserva, fecha_reserva')
      .eq('estado_reserva', 'confirmada')
      .eq('fecha_reserva', fechaHoy);
    
    if (errorConfirmadas) {
          }
    const { data: reservasPendientes, error: errorPendientes } = await supabase
      .from('reserva')
      .select('id_reserva, estado_reserva, fecha_reserva')
      .eq('estado_reserva', 'pendiente')
      .eq('fecha_reserva', fechaHoy);
    
    if (errorPendientes) {
          }
    const { error: errorIngresos } = await supabase
      .from('reserva')
      .select('id_reserva, costo_reserva, estado_reserva, fecha_reserva')
      .eq('fecha_reserva', fechaHoy)
      .neq('estado_reserva', 'cancelada');
    
    if (errorIngresos) {
          }
    

    
    const { data: pagosHoy, error: errorPagos } = await supabase
      .from('pago')
      .select('monto, fecha_pago')
      .eq('estado_pago', 'aprobado');
    
    if (errorPagos) {
      // Error silencioso
    }
    
    const ingresosDiarios = pagosHoy?.filter(pago => {
      if (!pago.fecha_pago) return false;
      
      try {
        // timestamptz se maneja directamente
        const fecha = new Date(pago.fecha_pago);
        
        // Validar fecha válida
        if (isNaN(fecha.getTime())) return false;
        
        const opciones = {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        } as const;
        
        const fechaPagoBuenosAires = new Intl.DateTimeFormat('sv-SE', opciones).format(fecha);
        return fechaPagoBuenosAires === fechaHoy;
      } catch {
        return false;
      }
    }).reduce((total, pago) => {
      return total + (pago.monto || 0);
    }, 0) || 0;
    

    
    // Reservas mensuales e ingresos
    const { data: reservasMensuales } = await supabase
      .from('reserva')
      .select('fecha_reserva')
      .gte('fecha_reserva', inicioMesStr)
      .lte('fecha_reserva', finMesStr)
      .neq('estado_reserva', 'cancelada');
    
    const { data: pagosMensuales, error: errorPagosMensuales } = await supabase
      .from('pago')
      .select('monto, fecha_pago')
      .eq('estado_pago', 'aprobado');
    
    if (errorPagosMensuales) {
      // Error silencioso
    }
    
    const ingresosMensuales = pagosMensuales?.filter(pago => {
      if (!pago.fecha_pago) return false;
      
      try {
        // timestamptz se maneja directamente
        const fecha = new Date(pago.fecha_pago);
        
        // Validar fecha válida
        if (isNaN(fecha.getTime())) return false;
        
        const opciones = {
          timeZone: 'America/Argentina/Buenos_Aires',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        } as const;
        
        const fechaPagoBuenosAires = new Intl.DateTimeFormat('sv-SE', opciones).format(fecha);
        return fechaPagoBuenosAires >= inicioMesStr && fechaPagoBuenosAires <= finMesStr;
      } catch {
        return false;
      }
    }).reduce((total, pago) => 
      total + (pago.monto || 0), 0) || 0;
    const { data: canchas, error: errorCanchas } = await supabase
      .from('cancha')
      .select('id_cancha, estado_cancha');
    
    if (errorCanchas) {
          }
    

    
    const canchasDisponibles = canchas?.filter(cancha => {
      const estado = cancha.estado_cancha?.toLowerCase();

      return estado === 'disponible';
    }).length || 0;
    

    
    // Clientes activos (con reservas este mes)
    const { data: clientesActivos, error: errorClientes } = await supabase
      .from('reserva')
      .select('id_cliente, fecha_reserva')
      .gte('fecha_reserva', inicioMesStr)
      .lte('fecha_reserva', finMesStr)
      .neq('estado_reserva', 'cancelada');
    
    if (errorClientes) {
          }
    
    const clientesUnicos = new Set(clientesActivos?.map(r => r.id_cliente)).size;

    


    
    return {
      reservasConfirmadas: reservasConfirmadas?.length || 0,
      reservasPendientes: reservasPendientes?.length || 0,
      ingresosDiarios,
      ingresosMensuales,
      canchasDisponibles,
      totalCanchas: canchas?.length || 0,
      clientesActivos: clientesUnicos,
      totalReservasMensuales: reservasMensuales?.length || 0
    };
  } catch {
        return {
      reservasConfirmadas: 0,
      reservasPendientes: 0,
      ingresosDiarios: 0,
      ingresosMensuales: 0,
      canchasDisponibles: 0,
      totalCanchas: 0,
      clientesActivos: 0,
      totalReservasMensuales: 0
    };
  }
}


// Obtener datos para gráfico de reservas por horario
export async function obtenerReservasPorHorario() {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { data: reservas } = await supabase
      .from('reserva')
      .select('hora_inicio')
      .neq('estado_reserva', 'cancelada');
    
    const horarios: { [key: string]: number } = {};
    
    reservas?.forEach(reserva => {
      const hora = reserva.hora_inicio.substring(0, 2) + ':00';
      horarios[hora] = (horarios[hora] || 0) + 1;
    });
    
    // Convertir a array ordenado
    return Object.entries(horarios)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, cantidad]) => ({ hora, cantidad }));
  } catch {
        return [];
  }
}

// Obtener datos para gráfico de reservas por día de la semana
export async function obtenerReservasPorDiaSemana() {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    // Obtener reservas del mes actual para tener datos más relevantes
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const inicioMesStr = obtenerFechaLocal(inicioMes);
    
    const { data: reservas, error } = await supabase
      .from('reserva')
      .select('fecha_reserva')
      .gte('fecha_reserva', inicioMesStr)
      .neq('estado_reserva', 'cancelada');
    
    if (error) {
      throw new Error(`Error al obtener reservas: ${error.message}`);
    }
    
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const conteo = Array(7).fill(0);
    
    reservas?.forEach(reserva => {
      // Usar la función local para consistencia con el timezone
      const fechaStr = reserva.fecha_reserva + 'T00:00:00';
      const fecha = new Date(fechaStr);
      const diaSemana = fecha.getDay();
      
      // Validar que el día sea válido
      if (diaSemana >= 0 && diaSemana <= 6) {
        conteo[diaSemana]++;
      }
    });
    
    return dias.map((dia, index) => ({ dia, cantidad: conteo[index] }));
  } catch {
        // Retornar datos vacíos pero válidos
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return dias.map(dia => ({ dia, cantidad: 0 }));
  }
}

// Obtener canchas más reservadas
export async function obtenerCanchasMasReservadas() {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    // Obtener fecha actual en Argentina (UTC-3)
    const ahora = new Date();
    const horaArgentina = new Date(ahora.getTime() - (3 * 60 * 60 * 1000)); // UTC-3
    
    // Calcular el lunes de la semana actual
    const diaSemana = horaArgentina.getDay(); // 0 = domingo, 1 = lunes, etc.
    const diasHastaLunes = diaSemana === 0 ? 6 : diaSemana - 1; // Si es domingo, retroceder 6 días
    
    const lunesActual = new Date(horaArgentina);
    lunesActual.setDate(horaArgentina.getDate() - diasHastaLunes);
    lunesActual.setHours(0, 0, 0, 0);
    
    // El domingo de la semana actual
    const domingoActual = new Date(lunesActual);
    domingoActual.setDate(lunesActual.getDate() + 6);
    domingoActual.setHours(23, 59, 59, 999);
    
    // Convertir a formato de fecha local para la consulta
    const fechaInicio = obtenerFechaLocal(lunesActual);
    const fechaFin = obtenerFechaLocal(domingoActual);
    
    // Obtener TODAS las canchas primero
    const { data: todasCanchas, error: errorCanchas } = await supabase
      .from('cancha')
      .select('id_cancha, nombre')
      .order('nombre');
    
    if (errorCanchas) {
      throw new Error(`Error al obtener canchas: ${errorCanchas.message}`);
    }
    
    // Obtener reservas de la semana actual (lunes a domingo)
    const { data: reservasSemanaActual, error: errorReservas } = await supabase
      .from('reserva')
      .select('id_cancha, fecha_reserva')
      .gte('fecha_reserva', fechaInicio)
      .lte('fecha_reserva', fechaFin)
      .neq('estado_reserva', 'cancelada');
    
    if (errorReservas) {
      throw new Error(`Error al obtener reservas: ${errorReservas.message}`);
    }
    
    // Contar reservas por cancha
    const conteoReservas: { [key: number]: number } = {};
    
    reservasSemanaActual?.forEach((reserva) => {
      const id = reserva.id_cancha;
      conteoReservas[id] = (conteoReservas[id] || 0) + 1;
    });
    
    // Crear resultado con TODAS las canchas, incluso las que tienen 0 reservas
    const resultado = todasCanchas?.map(cancha => ({
      nombre: cancha.nombre,
      cantidad: conteoReservas[cancha.id_cancha] || 0
    })) || [];
    
    // Ordenar por cantidad de reservas (mayor a menor) pero mantener todas
    return resultado.sort((a, b) => b.cantidad - a.cantidad);
    
  } catch {
        return [];
  }
}

// Obtener ingresos por mes (últimos 6 meses)
export async function obtenerIngresosMensuales() {
  try {
    const supabase = createServerComponentClient({ cookies });
    const hoy = new Date();
    const meses = [];
    
    // Generar últimos 6 meses
    for (let i = 5; i >= 0; i--) {
      const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const inicioMes = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
      const finMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0);
      
      const inicioMesStr = obtenerFechaLocal(inicioMes);
      const finMesStr = obtenerFechaLocal(finMes);
      
      const { data: reservas } = await supabase
        .from('reserva')
        .select('costo_reserva')
        .gte('fecha_reserva', inicioMesStr)
        .lte('fecha_reserva', finMesStr)
        .neq('estado_reserva', 'cancelada');
      
      const ingresos = reservas?.reduce((total, reserva) => 
        total + (reserva.costo_reserva || 0), 0) || 0;
      
      meses.push({
        mes: fecha.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }),
        ingresos
      });
    }
    
    return meses;
  } catch {
        return [];
  }
}

// Obtener horarios disponibles por cancha para hoy - TODAS las canchas del predio
export async function obtenerHorariosDisponibles() {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    // Obtener fecha y hora actual en Buenos Aires (UTC-3)
    // El servidor está en UTC, así que convertimos a Buenos Aires
    const ahoraUTC = new Date();
    const ahoraBuenosAires = new Date(ahoraUTC.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const hoy = obtenerFechaLocal(ahoraBuenosAires);
    const horaActual = ahoraBuenosAires.getHours();
    

    
    // Obtener TODAS las canchas del predio (sin filtrar por estado)
    const { data: canchas, error: errorCanchas } = await supabase
      .from('cancha')
      .select('*')
      .order('id_cancha');
    
    if (errorCanchas) {
      throw new Error(`Error al obtener canchas: ${errorCanchas.message}`);
    }
    
    // Obtener reservas de hoy (solo activas: confirmadas y pendientes)
    const { data: reservasHoy, error: errorReservas } = await supabase
      .from('reserva')
      .select('id_cancha, hora_inicio, hora_fin')
      .eq('fecha_reserva', hoy)
      .in('estado_reserva', ['confirmada', 'pendiente']);
    
    if (errorReservas) {
      throw new Error(`Error al obtener reservas: ${errorReservas.message}`);
    }
    

    const generarHorariosCompletos = (cancha: { id_cancha: number; nombre: string; estado?: string; estado_cancha?: string }, reservasCancha: { hora_inicio: string; hora_fin: string }[]) => {
      const horariosDisponibles: string[] = [];
      const horariosPasados: string[] = [];
      
      // Verificar si la cancha está disponible para reservas
      const estadoReal = cancha.estado?.toLowerCase();
      const estadoCompatibilidad = cancha.estado_cancha?.toLowerCase();
      
      const estadosNoDisponibles = [
        'no disponible', 
        'en mantenimiento', 
        'mantenimiento',
        'fuera de servicio',
        'inactiva',
        'inactivo',
        'cerrada',
        'cerrado'
      ];
      
      const canchaEnMantenimiento = 
        (estadoReal && estadosNoDisponibles.includes(estadoReal)) || 
        (estadoCompatibilidad && estadosNoDisponibles.includes(estadoCompatibilidad));
      
      // Horario de funcionamiento completo (8:00 - 23:00, incluyendo 23:00)
      const horaInicio = 8;
      const horaFin = 24; // Cambiado para incluir 23:00
      
      // Crear mapa de horarios ocupados por reservas
      const horariosReservados = new Set<string>();
      const rangosOcupados: string[] = [];
      
      reservasCancha.forEach(reserva => {
        const inicioHora = parseInt(reserva.hora_inicio.split(':')[0]);
        const finHora = parseInt(reserva.hora_fin.split(':')[0]) || 24; // 00:00 = 24
        

        for (let h = inicioHora; h < finHora; h++) {
          const horaStr = h.toString().padStart(2, '0') + ':00';
          horariosReservados.add(horaStr);
        }
        
        // Agregar el rango completo a la lista de ocupados
        const rangoCompleto = `${reserva.hora_inicio.substring(0, 5)}-${reserva.hora_fin === '00:00' ? '00:00' : reserva.hora_fin.substring(0, 5)}`;
        if (!rangosOcupados.includes(rangoCompleto)) {
          rangosOcupados.push(rangoCompleto);
        }
      });
      

      for (let hora = horaInicio; hora < horaFin && hora <= 23; hora++) {
        const horaStr = hora.toString().padStart(2, '0') + ':00';
        
        // Verificar si el horario ya pasó (solo para el día actual)
        // Un horario se considera pasado si:
        // 1. La hora es menor a la actual (ej: 16:00 cuando son las 19:xx)
        // 2. Es la misma hora pero ya pasó (ej: 19:00 cuando son las 19:01)
        const esHorarioPasado = hora <= horaActual;
        

        
        // Verificar si está ocupado por reserva
        const estaOcupado = horariosReservados.has(horaStr);
        
        if (canchaEnMantenimiento) {
          // Si la cancha está en mantenimiento, no hay horarios disponibles
          // Los horarios se mostrarán como "no disponible por mantenimiento"
        } else if (esHorarioPasado) {
          horariosPasados.push(horaStr);
        } else if (estaOcupado) {
          // Ya está en rangosOcupados
        } else {
          horariosDisponibles.push(horaStr);
        }
      }
      

      const horariosOcupadosIndividuales = Array.from(horariosReservados).sort();

      return {
        horariosOcupados: rangosOcupados, // Para mostrar rangos completos
        horariosOcupadosIndividuales: horariosOcupadosIndividuales, // Para mostrar horarios individuales
        horariosDisponibles: horariosDisponibles,
        horariosPasados: horariosPasados,
        canchaEnMantenimiento: !!canchaEnMantenimiento, // Forzar boolean
        estadoCancha: canchaEnMantenimiento ? 'En mantenimiento' : 'Operativa'
      };
    };
    
    return canchas?.map(cancha => {
      const reservasCancha = reservasHoy?.filter(r => r.id_cancha === cancha.id_cancha) || [];
      const { horariosOcupados, horariosOcupadosIndividuales, horariosDisponibles, horariosPasados, canchaEnMantenimiento, estadoCancha } = generarHorariosCompletos(cancha, reservasCancha);
      
      return {
        id_cancha: cancha.id_cancha,
        nombre: cancha.nombre || `Cancha ${cancha.id_cancha}`,
        tipo: cancha.tipo || 'N/A',
        tarifa_hora: cancha.tarifa_hora || 0,
        disponibilidad_horaria: cancha.disponibilidad_horaria || '08:00-23:00',
        horariosOcupados,
        horariosOcupadosIndividuales,
        horariosDisponibles,
        horariosPasados,
        canchaEnMantenimiento,
        estadoCancha,
        totalHorariosHoy: 16 // 8:00 a 23:00 = 16 horarios
      };
    }) || [];
    
  } catch {
        return [];
  }
}

// Obtener reservas para el dashboard (con filtro de fecha opcional)
export async function obtenerReservasRecientes(limite = 10, fechaFiltro?: string) {
  try {
    const supabase = createServerComponentClient({ cookies });
    
    let query = supabase
      .from('reserva')
      .select(`
        *,
        cliente:cliente(nombre, apellido),
        cancha:cancha(nombre)
      `);
    
    // Si se proporciona una fecha específica, filtrar por esa fecha
    if (fechaFiltro) {
      query = query.eq('fecha_reserva', fechaFiltro);
    }
    
    const { data: reservas } = await query
      .order('fecha_reserva', { ascending: false })
      .order('hora_inicio', { ascending: false })
      .limit(limite);
    
    return reservas?.map((reserva) => ({
      id_reserva: reserva.id_reserva,
      cliente_nombre: `${reserva.cliente?.nombre || ''} ${reserva.cliente?.apellido || ''}`.trim(),
      cancha_nombre: reserva.cancha?.nombre || `Cancha ${reserva.id_cancha}`,
      fecha_reserva: reserva.fecha_reserva,
      hora_inicio: reserva.hora_inicio,
      hora_fin: reserva.hora_fin,
      estado_reserva: reserva.estado_reserva,
      costo_reserva: reserva.costo_reserva
    })) || [];
  } catch {
        return [];
  }
}

// Obtener reservas del día actual para el dashboard
export async function obtenerReservasDelDia(limite = 20) {
  try {
    // Obtener fecha actual (asumiendo servidor en horario argentino)
    const hoy = obtenerFechaLocal(new Date());
    return await obtenerReservasRecientes(limite, hoy);
  } catch {
        return [];
  }
}



// Función para obtener reservas pendientes que exceden el tiempo límite
export async function obtenerReservasPendientesVencidas(tiempoLimiteMinutos = 5) {
  // Usar Service Role Key para procesos automáticos (no cookies de usuario)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return [];
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // No necesitamos verificar conectividad de usuario para procesos automáticos
    
    // Calcular el timestamp límite (5 minutos atrás)
    const tiempoLimite = new Date();
    tiempoLimite.setMinutes(tiempoLimite.getMinutes() - tiempoLimiteMinutos);
    
    const { data, error } = await supabase
      .from('reserva')
      .select('id_reserva, fecha_reserva, hora_inicio, created_at, estado_reserva')
      .eq('estado_reserva', 'pendiente')
      .lt('created_at', tiempoLimite.toISOString());
    
    if (error) {
            return [];
    }
    
    return data || [];
  } catch {
        return [];
  }
}

// Función para cancelar automáticamente reservas pendientes vencidas
export async function cancelarReservasPendientesVencidas() {
  // Usar Service Role Key para procesos automáticos (no cookies de usuario)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // No necesitamos verificar conectividad de usuario para procesos automáticos
    
    // Obtener reservas vencidas
    const reservasVencidas = await obtenerReservasPendientesVencidas();
    
    if (reservasVencidas.length === 0) {
      return { 
        success: true,
        canceladas: 0, 
        mensaje: 'No hay reservas pendientes vencidas' 
      };
    }
    
    // Extraer IDs de las reservas vencidas
    const idsVencidos = reservasVencidas.map(r => r.id_reserva);
    
    // Actualizar todas las reservas vencidas a estado "cancelada"
    const { error } = await supabase
      .from('reserva')
      .update({ 
        estado_reserva: 'cancelada'
      })
      .in('id_reserva', idsVencidos);
    
    if (error) {
            throw new Error('Error al cancelar reservas vencidas');
    }
    

    
    // Revalidar páginas relacionadas
    revalidatePath('/reservas');
    revalidatePath('/dashboard');
    
    return {
      success: true,
      canceladas: reservasVencidas.length,
      mensaje: `Se cancelaron ${reservasVencidas.length} reservas pendientes que excedieron el tiempo límite de 5 minutos`,
      reservas: reservasVencidas
    };
    
  } catch (error) {
        return {
      success: false,
      canceladas: 0,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}

// Función para verificar el tiempo restante de una reserva pendiente
export async function obtenerTiempoRestanteReserva(idReserva: number) {
  const supabase = createServerComponentClient({ cookies });
  
  try {
    const { data, error } = await supabase
      .from('reserva')
      .select('created_at, estado_reserva')
      .eq('id_reserva', idReserva)
      .eq('estado_reserva', 'pendiente')
      .single();
    
    if (error || !data) {
      return null;
    }
    
    const fechaCreacion = new Date(data.created_at);
    const ahora = new Date();
    const tiempoTranscurridoMs = ahora.getTime() - fechaCreacion.getTime();
    const tiempoLimiteMs = 5 * 60 * 1000; // 5 minutos en milisegundos
    const tiempoRestanteMs = Math.max(0, tiempoLimiteMs - tiempoTranscurridoMs);
    
    const minutosRestantes = Math.floor(tiempoRestanteMs / (60 * 1000));
    const segundosRestantes = Math.floor(tiempoRestanteMs / 1000);
    
    return {
      minutosRestantes,
      segundosRestantes,
      vencida: tiempoRestanteMs === 0,
      porcentajeTranscurrido: Math.min(100, (tiempoTranscurridoMs / tiempoLimiteMs) * 100)
    };
    
  } catch {
        return null;
  }
}

// ============================================================================
// PASO 3: lógica de reservas migrada al modelo `recurso`.
// Estas funciones son NUEVAS y conviven con las de `cancha` de arriba (que
// siguen usándose desde app/(protected)/canchas, CanchaForm/CanchasList y el
// dashboard). No se modificó ni se eliminó ninguna función legacy.
// ============================================================================

// Recursos activos y disponibles para reservar (equivalente a obtenerCanchasDisponibles
// pero sobre la tabla `recurso`).
export async function obtenerRecursosDisponibles(): Promise<Recurso[]> {
  try {
    const supabase = createServerComponentClient({ cookies });
    await verificarConectividad(supabase);

    const { data: recursos, error } = await supabase
      .from('recurso')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        throw new Error('La tabla "recurso" no existe en la base de datos.');
      }
      throw new Error('Error al cargar los recursos: ' + error.message);
    }

    return (recursos || []).filter(recurso => recurso.estado === 'DISPONIBLE');
  } catch (error) {
    throw new Error('Error al cargar los recursos: ' + (error as Error).message);
  }
}

// Reservas que hoy bloquean el recurso (confirmadas, o pendientes con pago aún vigente).
// Reemplaza a obtenerReservasPorFechaYCancha para el flujo basado en recurso.
export async function obtenerReservasPorFechaYRecurso(fecha: string, idRecurso: number) {
  try {
    const supabase = createServerComponentClient({ cookies });

    const { data, error } = await supabase
      .from('reserva')
      .select('hora_inicio, hora_fin, estado_reserva, fecha_expiracion_pago')
      .eq('fecha_reserva', fecha)
      .eq('id_recurso', idRecurso)
      .neq('estado_reserva', 'cancelada');

    if (error) {
      return [];
    }

    const ahora = new Date();
    return (data || []).filter(reserva => reservaBloqueaRecurso(reserva, ahora));
  } catch {
    return [];
  }
}

// Horario de apertura/cierre del recurso para un día de la semana (0=domingo..6=sábado).
// Reemplaza el rango fijo hardcodeado del formulario de reservas por `recurso_horario`.
export async function obtenerHorarioRecurso(idRecurso: number, diaSemana: number) {
  try {
    const supabase = createServerComponentClient({ cookies });

    const { data, error } = await supabase
      .from('recurso_horario')
      .select('hora_apertura, hora_cierre')
      .eq('id_recurso', idRecurso)
      .eq('dia_semana', diaSemana)
      .eq('activo', true)
      .maybeSingle();

    if (error) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

// Bloqueos activos de un recurso en una fecha (mantenimiento, feriados, etc.).
// Se comparan igual que las reservas: mismo formato hora_inicio/hora_fin.
export async function obtenerBloqueosActivosRecurso(fecha: string, idRecurso: number) {
  try {
    const supabase = createServerComponentClient({ cookies });

    const { data, error } = await supabase
      .from('recurso_bloqueo')
      .select('hora_inicio, hora_fin')
      .eq('id_recurso', idRecurso)
      .eq('fecha', fecha)
      .eq('activo', true);

    if (error) {
      return [];
    }

    return data || [];
  } catch {
    return [];
  }
}

// Resuelve el precio desde la tabla `tarifa` (id_recurso + tipo_cliente + duracion_minutos
// + vigencia). No inventa precios: si no hay tarifa vigente, lanza un error controlado.
export async function calcularCostoReservaPorRecurso(
  idRecurso: number,
  tipoCliente: 'SOCIO' | 'NO_SOCIO',
  duracionMinutos: number
): Promise<number> {
  const supabase = createServerComponentClient({ cookies });
  const hoy = obtenerFechaLocal(new Date());

  const { data: tarifas, error } = await supabase
    .from('tarifa')
    .select('precio, vigente_desde, vigente_hasta')
    .eq('id_recurso', idRecurso)
    .eq('tipo_cliente', tipoCliente)
    .eq('duracion_minutos', duracionMinutos)
    .eq('activo', true);

  if (error) {
    throw new Error(`Error al consultar la tarifa: ${error.message}`);
  }

  const tarifaVigente = (tarifas || []).find(tarifa => {
    const desdeOk = !tarifa.vigente_desde || tarifa.vigente_desde <= hoy;
    const hastaOk = !tarifa.vigente_hasta || tarifa.vigente_hasta >= hoy;
    return desdeOk && hastaOk;
  });

  if (!tarifaVigente) {
    throw new Error(
      `No existe una tarifa vigente para el recurso ${idRecurso} (tipo_cliente: ${tipoCliente}, duración: ${duracionMinutos} min). Configure la tarifa antes de reservar.`
    );
  }

  return tarifaVigente.precio;
}

// Tipo de cliente para tarifas; si no está definido se asume NO_SOCIO de forma
// conservadora (nunca se otorgan beneficios de socio sin confirmarlo explícitamente).
async function obtenerTipoClienteParaTarifa(idCliente: number): Promise<'SOCIO' | 'NO_SOCIO'> {
  const supabase = createServerComponentClient({ cookies });

  const { data, error } = await supabase
    .from('cliente')
    .select('tipo_cliente')
    .eq('id_cliente', idCliente)
    .single();

  if (error || !data?.tipo_cliente) {
    return 'NO_SOCIO';
  }

  return data.tipo_cliente === 'SOCIO' ? 'SOCIO' : 'NO_SOCIO';
}

// Verifica disponibilidad por recurso mediante solapamiento de intervalos (no
// igualdad de hora_inicio) e ignora reservas PENDIENTE cuyo pago ya venció.
async function verificarDisponibilidadRecurso(
  fecha: string,
  horaInicio: string,
  horaFin: string,
  idRecurso: number,
  idReservaExcluir?: number
) {
  const supabase = createServerComponentClient({ cookies });

  let query = supabase
    .from('reserva')
    .select('id_reserva, hora_inicio, hora_fin, estado_reserva, fecha_expiracion_pago')
    .eq('id_recurso', idRecurso)
    .eq('fecha_reserva', fecha)
    .neq('estado_reserva', 'cancelada');

  if (idReservaExcluir) {
    query = query.neq('id_reserva', idReservaExcluir);
  }

  const { data: reservasDelDia, error } = await query;

  if (error) {
    throw new Error(`Error al verificar disponibilidad del recurso: ${error.message}`);
  }

  const ahora = new Date();
  const conflictos = (reservasDelDia || [])
    .filter(reserva => reservaBloqueaRecurso(reserva, ahora))
    .filter(reserva => haySolapamientoDeHorarios(horaInicio, horaFin, reserva.hora_inicio, reserva.hora_fin));

  if (conflictos.length > 0) {
    const detalle = conflictos
      .map(c => `${c.hora_inicio.substring(0, 5)}-${c.hora_fin.substring(0, 5)}`)
      .join(', ');
    throw new Error(`El recurso ya tiene una reserva que se solapa con ese horario (${detalle}).`);
  }

  const bloqueos = await obtenerBloqueosActivosRecurso(fecha, idRecurso);
  const bloqueosEnConflicto = bloqueos.filter(bloqueo =>
    haySolapamientoDeHorarios(horaInicio, horaFin, bloqueo.hora_inicio, bloqueo.hora_fin)
  );

  if (bloqueosEnConflicto.length > 0) {
    const detalle = bloqueosEnConflicto
      .map(b => `${b.hora_inicio.substring(0, 5)}-${b.hora_fin.substring(0, 5)}`)
      .join(', ');
    throw new Error(`El recurso tiene un bloqueo que se solapa con ese horario (${detalle}).`);
  }

  return true;
}

// Crea una reserva sobre el nuevo modelo (id_recurso + duracion_minutos).
// La verificación de solapamiento/bloqueos y el insert ahora son atómicos dentro
// del RPC `crear_reserva_recurso` (advisory lock transaccional en Postgres).
export async function crearReservaRecurso(datos: NuevaReservaRecursoInput) {
  const supabase = createServerComponentClient({ cookies });

  if (!esDuracionValida(datos.duracion_minutos)) {
    throw new Error(`Duración no válida: ${datos.duracion_minutos} minutos. Valores permitidos: ${DURACIONES_VALIDAS_MINUTOS.join(' o ')} minutos.`);
  }

  const horaFin = calcularHoraFinPorDuracion(datos.hora_inicio, datos.duracion_minutos);

  const tipoCliente = await obtenerTipoClienteParaTarifa(datos.id_cliente);
  const costoReserva = await calcularCostoReservaPorRecurso(datos.id_recurso, tipoCliente, datos.duracion_minutos);

  const { data, error } = await supabase.rpc('crear_reserva_recurso', {
    p_id_cliente: datos.id_cliente,
    p_id_recurso: datos.id_recurso,
    p_fecha_reserva: datos.fecha_reserva,
    p_hora_inicio: datos.hora_inicio,
    p_hora_fin: horaFin,
    p_duracion_minutos: datos.duracion_minutos,
    p_costo_reserva: costoReserva
  });

  if (error) {
    throw new Error(`Error al crear la reserva: ${error.message}`);
  }

  const resultado = data as {
    success: boolean;
    id_reserva?: number;
    error_code?: 'DURACION_INVALIDA' | 'HORARIO_INVALIDO' | 'RECURSO_NO_DISPONIBLE' | 'CONFLICTO_RESERVA' | 'CONFLICTO_BLOQUEO';
    message?: string;
  } | null;

  if (!resultado?.success) {
    throw new Error(resultado?.message || `No se pudo crear la reserva (${resultado?.error_code || 'ERROR_DESCONOCIDO'}).`);
  }

  revalidatePath('/reservas');
  return resultado.id_reserva as number;
}

// Actualiza una reserva del nuevo modelo, recalculando hora_fin y costo.
export async function actualizarReservaRecurso(id: number, datos: NuevaReservaRecursoInput) {
  const supabase = createServerComponentClient({ cookies });

  if (!esDuracionValida(datos.duracion_minutos)) {
    throw new Error(`Duración no válida: ${datos.duracion_minutos} minutos. Valores permitidos: ${DURACIONES_VALIDAS_MINUTOS.join(' o ')} minutos.`);
  }

  const horaFin = calcularHoraFinPorDuracion(datos.hora_inicio, datos.duracion_minutos);

  await verificarDisponibilidadRecurso(datos.fecha_reserva, datos.hora_inicio, horaFin, datos.id_recurso, id);

  const tipoCliente = await obtenerTipoClienteParaTarifa(datos.id_cliente);
  const costoReserva = await calcularCostoReservaPorRecurso(datos.id_recurso, tipoCliente, datos.duracion_minutos);

  const { error } = await supabase
    .from('reserva')
    .update({
      id_cliente: datos.id_cliente,
      id_recurso: datos.id_recurso,
      fecha_reserva: datos.fecha_reserva,
      hora_inicio: datos.hora_inicio,
      hora_fin: horaFin,
      duracion_minutos: datos.duracion_minutos,
      costo_reserva: costoReserva
    })
    .eq('id_reserva', id);

  if (error) {
    throw new Error(`Error al actualizar la reserva: ${error.message}`);
  }

  revalidatePath('/reservas');
  return true;
}

// ============================================================================
// DASHBOARD (modelo recurso): funciones nuevas para el Dashboard principal.
// Reemplazan, solo en el Dashboard, a las legacy basadas en `cancha`
// (obtenerEstadisticasDashboard, obtenerHorariosDisponibles, obtenerReservasPorHorario).
// Esas funciones legacy NO se modifican ni se eliminan.
// ============================================================================

function generarSlotsDeMediaHora(horaApertura: string, horaCierre: string): string[] {
  const slots: string[] = [];
  const aperturaMin = horaAMinutos(horaApertura);
  const cierreMin = horaAMinutos(horaCierre);

  for (let minuto = aperturaMin; minuto + 30 <= cierreMin; minuto += 30) {
    const hh = Math.floor(minuto / 60).toString().padStart(2, '0');
    const mm = (minuto % 60).toString().padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }

  return slots;
}

// KPIs del dashboard usando `recurso` en lugar de `cancha` para disponibilidad.
export async function obtenerEstadisticasDashboardRecursos() {
  try {
    const supabase = createServerComponentClient({ cookies });

    const ahoraUTC = new Date();
    const hoy = new Date(ahoraUTC.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const fechaHoy = obtenerFechaLocal(hoy);

    const inicioDelMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    const inicioMesStr = obtenerFechaLocal(inicioDelMes);
    const finMesStr = obtenerFechaLocal(finDelMes);

    const { data: reservasConfirmadas } = await supabase
      .from('reserva')
      .select('id_reserva')
      .eq('estado_reserva', 'confirmada')
      .eq('fecha_reserva', fechaHoy);

    const { data: reservasPendientes } = await supabase
      .from('reserva')
      .select('id_reserva')
      .eq('estado_reserva', 'pendiente')
      .eq('fecha_reserva', fechaHoy);

    const { data: pagosHoy } = await supabase
      .from('pago')
      .select('monto, fecha_pago')
      .eq('estado_pago', 'aprobado');

    const ingresosDiarios = (pagosHoy || []).filter(pago => {
      if (!pago.fecha_pago) return false;
      try {
        const fecha = new Date(pago.fecha_pago);
        if (isNaN(fecha.getTime())) return false;
        const fechaPagoBuenosAires = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(fecha);
        return fechaPagoBuenosAires === fechaHoy;
      } catch {
        return false;
      }
    }).reduce((total, pago) => total + (pago.monto || 0), 0);

    const { data: reservasMensuales } = await supabase
      .from('reserva')
      .select('fecha_reserva')
      .gte('fecha_reserva', inicioMesStr)
      .lte('fecha_reserva', finMesStr)
      .neq('estado_reserva', 'cancelada');

    const { data: pagosMensuales } = await supabase
      .from('pago')
      .select('monto, fecha_pago')
      .eq('estado_pago', 'aprobado');

    const ingresosMensuales = (pagosMensuales || []).filter(pago => {
      if (!pago.fecha_pago) return false;
      try {
        const fecha = new Date(pago.fecha_pago);
        if (isNaN(fecha.getTime())) return false;
        const fechaPagoBuenosAires = new Intl.DateTimeFormat('sv-SE', {
          timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit'
        }).format(fecha);
        return fechaPagoBuenosAires >= inicioMesStr && fechaPagoBuenosAires <= finMesStr;
      } catch {
        return false;
      }
    }).reduce((total, pago) => total + (pago.monto || 0), 0);

    const { data: recursos } = await supabase
      .from('recurso')
      .select('id_recurso, estado')
      .eq('activo', true);

    const recursosDisponibles = (recursos || []).filter(r => r.estado === 'DISPONIBLE').length;

    const { data: clientesActivos } = await supabase
      .from('reserva')
      .select('id_cliente')
      .gte('fecha_reserva', inicioMesStr)
      .lte('fecha_reserva', finMesStr)
      .neq('estado_reserva', 'cancelada');

    const clientesUnicos = new Set((clientesActivos || []).map(r => r.id_cliente)).size;

    return {
      reservasConfirmadas: reservasConfirmadas?.length || 0,
      reservasPendientes: reservasPendientes?.length || 0,
      ingresosDiarios,
      ingresosMensuales,
      recursosDisponibles,
      totalRecursos: recursos?.length || 0,
      clientesActivos: clientesUnicos,
      totalReservasMensuales: reservasMensuales?.length || 0
    };
  } catch {
    return {
      reservasConfirmadas: 0,
      reservasPendientes: 0,
      ingresosDiarios: 0,
      ingresosMensuales: 0,
      recursosDisponibles: 0,
      totalRecursos: 0,
      clientesActivos: 0,
      totalReservasMensuales: 0
    };
  }
}

// Estado/disponibilidad de hoy para todos los recursos activos, usando
// recurso_horario (apertura/cierre del día) y recurso_bloqueo, en slots de 30 min.
export async function obtenerDisponibilidadRecursosHoy() {
  try {
    const supabase = createServerComponentClient({ cookies });

    const ahoraUTC = new Date();
    const ahoraBuenosAires = new Date(ahoraUTC.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));
    const hoy = obtenerFechaLocal(ahoraBuenosAires);
    const diaSemana = ahoraBuenosAires.getDay();
    const minutoActual = ahoraBuenosAires.getHours() * 60 + ahoraBuenosAires.getMinutes();

    const { data: recursos, error: errorRecursos } = await supabase
      .from('recurso')
      .select('*')
      .eq('activo', true)
      .order('id_recurso');

    if (errorRecursos) {
      throw new Error(`Error al obtener recursos: ${errorRecursos.message}`);
    }

    const idsRecurso = (recursos || []).map(r => r.id_recurso);

    if (idsRecurso.length === 0) {
      return [];
    }

    const [{ data: horarios }, { data: reservasHoy }, { data: bloqueosHoy }] = await Promise.all([
      supabase.from('recurso_horario').select('id_recurso, hora_apertura, hora_cierre').in('id_recurso', idsRecurso).eq('dia_semana', diaSemana).eq('activo', true),
      supabase.from('reserva').select('id_recurso, hora_inicio, hora_fin, estado_reserva, fecha_expiracion_pago').in('id_recurso', idsRecurso).eq('fecha_reserva', hoy).neq('estado_reserva', 'cancelada'),
      supabase.from('recurso_bloqueo').select('id_recurso, hora_inicio, hora_fin').in('id_recurso', idsRecurso).eq('fecha', hoy).eq('activo', true)
    ]);

    const ahora = new Date();

    return (recursos || []).map(recurso => {
      const horario = (horarios || []).find(h => h.id_recurso === recurso.id_recurso);
      const enMantenimiento = recurso.estado !== 'DISPONIBLE';

      const base = {
        id_recurso: recurso.id_recurso,
        nombre: recurso.nombre,
        tipo_recurso: recurso.tipo_recurso,
        deporte: recurso.deporte,
        capacidad: recurso.capacidad,
        estado: recurso.estado,
        activo: recurso.activo,
        enMantenimiento
      };

      if (!horario) {
        return {
          ...base,
          horaApertura: null,
          horaCierre: null,
          horariosOcupados: [],
          horariosDisponibles: [],
          horariosPasados: [],
          totalHorariosHoy: 0
        };
      }

      const reservasRecurso = (reservasHoy || [])
        .filter(r => r.id_recurso === recurso.id_recurso)
        .filter(r => reservaBloqueaRecurso(r, ahora));

      const bloqueosRecurso = (bloqueosHoy || []).filter(b => b.id_recurso === recurso.id_recurso);

      const slots = generarSlotsDeMediaHora(horario.hora_apertura, horario.hora_cierre);
      const disponibles: string[] = [];
      const pasados: string[] = [];
      const rangosOcupados = new Set<string>();

      slots.forEach(slot => {
        if (enMantenimiento) return;

        const finSlot = calcularHoraFinPorDuracion(slot, 30);
        const reservaOcupante = reservasRecurso.find(r => haySolapamientoDeHorarios(slot, finSlot, r.hora_inicio, r.hora_fin));
        const bloqueoOcupante = bloqueosRecurso.find(b => haySolapamientoDeHorarios(slot, finSlot, b.hora_inicio, b.hora_fin));

        if (reservaOcupante) {
          rangosOcupados.add(`${reservaOcupante.hora_inicio.substring(0, 5)}-${reservaOcupante.hora_fin.substring(0, 5)}`);
        } else if (bloqueoOcupante) {
          rangosOcupados.add(`${bloqueoOcupante.hora_inicio.substring(0, 5)}-${bloqueoOcupante.hora_fin.substring(0, 5)}`);
        } else if (horaAMinutos(slot) <= minutoActual) {
          pasados.push(slot);
        } else {
          disponibles.push(slot);
        }
      });

      return {
        ...base,
        horaApertura: horario.hora_apertura,
        horaCierre: horario.hora_cierre,
        horariosOcupados: Array.from(rangosOcupados),
        horariosDisponibles: disponibles,
        horariosPasados: pasados,
        totalHorariosHoy: slots.length
      };
    });
  } catch {
    return [];
  }
}

// Disponibilidad de un recurso para los próximos 7 días (modal del dashboard),
// resuelta en una sola server action para no hacer 7 consultas desde el cliente.
export async function obtenerDisponibilidadSemanalRecurso(idRecurso: number) {
  try {
    const supabase = createServerComponentClient({ cookies });

    const ahoraUTC = new Date();
    const ahoraBuenosAires = new Date(ahoraUTC.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }));

    const fechas: string[] = [];
    for (let i = 0; i < 7; i++) {
      const fecha = new Date(ahoraBuenosAires);
      fecha.setDate(ahoraBuenosAires.getDate() + i);
      fechas.push(obtenerFechaLocal(fecha));
    }

    const [{ data: horarios }, { data: reservas }, { data: bloqueos }] = await Promise.all([
      supabase.from('recurso_horario').select('dia_semana, hora_apertura, hora_cierre').eq('id_recurso', idRecurso).eq('activo', true),
      supabase.from('reserva').select('fecha_reserva, hora_inicio, hora_fin, estado_reserva, fecha_expiracion_pago').eq('id_recurso', idRecurso).gte('fecha_reserva', fechas[0]).lte('fecha_reserva', fechas[6]).neq('estado_reserva', 'cancelada'),
      supabase.from('recurso_bloqueo').select('fecha, hora_inicio, hora_fin').eq('id_recurso', idRecurso).eq('activo', true).gte('fecha', fechas[0]).lte('fecha', fechas[6])
    ]);

    const ahora = new Date();

    return fechas.map(fecha => {
      const [year, month, day] = fecha.split('-').map(Number);
      const diaSemana = new Date(year, month - 1, day).getDay();
      const horario = (horarios || []).find(h => h.dia_semana === diaSemana);

      if (!horario) {
        return { fecha, horaApertura: null, horaCierre: null, horariosDisponibles: [], horariosOcupados: [] };
      }

      const reservasDelDia = (reservas || [])
        .filter(r => r.fecha_reserva === fecha)
        .filter(r => reservaBloqueaRecurso(r, ahora));
      const bloqueosDelDia = (bloqueos || []).filter(b => b.fecha === fecha);

      const slots = generarSlotsDeMediaHora(horario.hora_apertura, horario.hora_cierre);
      const disponibles: string[] = [];
      const ocupados: string[] = [];

      slots.forEach(slot => {
        const finSlot = calcularHoraFinPorDuracion(slot, 30);
        const ocupado =
          reservasDelDia.some(r => haySolapamientoDeHorarios(slot, finSlot, r.hora_inicio, r.hora_fin)) ||
          bloqueosDelDia.some(b => haySolapamientoDeHorarios(slot, finSlot, b.hora_inicio, b.hora_fin));

        if (ocupado) {
          ocupados.push(slot);
        } else {
          disponibles.push(slot);
        }
      });

      return {
        fecha,
        horaApertura: horario.hora_apertura,
        horaCierre: horario.hora_cierre,
        horariosDisponibles: disponibles,
        horariosOcupados: ocupados
      };
    });
  } catch {
    return [];
  }
}

// Reservas por horario en buckets de 30 min (en vez de forzar todo a :00),
// agnóstico de cancha/recurso ya que solo agrupa por reserva.hora_inicio.
export async function obtenerReservasPorHorarioRecurso() {
  try {
    const supabase = createServerComponentClient({ cookies });
    const { data: reservas } = await supabase
      .from('reserva')
      .select('hora_inicio')
      .neq('estado_reserva', 'cancelada');

    const horarios: { [key: string]: number } = {};

    (reservas || []).forEach(reserva => {
      const minutos = horaAMinutos(reserva.hora_inicio.substring(0, 5));
      const minutosRedondeados = Math.floor(minutos / 30) * 30;
      const hh = Math.floor(minutosRedondeados / 60).toString().padStart(2, '0');
      const mm = (minutosRedondeados % 60).toString().padStart(2, '0');
      horarios[`${hh}:${mm}`] = (horarios[`${hh}:${mm}`] || 0) + 1;
    });

    return Object.entries(horarios)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hora, cantidad]) => ({ hora, cantidad }));
  } catch {
    return [];
  }
}



