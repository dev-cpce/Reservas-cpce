'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

import { Recurso, NuevaReservaRecursoInput } from '@/types';
import {
  DURACIONES_VALIDAS_MINUTOS,
  esDuracionValida,
  calcularHoraFinPorDuracion,
  haySolapamientoDeHorarios,
  reservaBloqueaRecurso,
  horaAMinutos
} from '@/lib/recursoDisponibilidad';
import { tienePermisoUsuario } from '@/lib/auth/tienePermisoUsuario';

function obtenerFechaLocal(fecha: Date): string {
  return fecha.getFullYear() + '-' + 
         String(fecha.getMonth() + 1).padStart(2, '0') + '-' + 
         String(fecha.getDate()).padStart(2, '0');
}

async function cargarRelacionesReservas(
  supabase: ReturnType<typeof createServerComponentClient>,
  reservas: Array<{ id_cliente: number; id_recurso?: number | null }>
) {
  const clientes = new Map<number, { nombre: string; apellido: string | null }>();
  const recursos = new Map<number, { nombre: string }>();

  // id_recurso puede ser NULL (Number(null) === 0 es finito, por eso se
  // excluyen null/undefined explícitamente en vez de confiar solo en Number.isFinite).
  const esIdValido = (id: unknown): id is number => typeof id === 'number' && Number.isFinite(id);

  const idsCliente = Array.from(new Set(reservas.map(reserva => reserva.id_cliente).filter(esIdValido)));
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

  return { clientes, recursos };
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
    const { clientes, recursos } = await cargarRelacionesReservas(supabase, filas);

    return filas.map(reserva => ({
      ...reserva,
      cliente: clientes.get(reserva.id_cliente) || null,
      recurso: recursos.get(reserva.id_recurso) || null
    }));
    
  } catch (error) {
        throw new Error('Error al cargar las reservas: ' + (error as Error).message);
  }
}

// Cambiar el estado de una reserva
export async function cambiarEstadoReserva(id: number, estado: string) {
  const estadosValidos = [
    'pendiente',
    'confirmada',
    'cancelada',
    'completada',
  ];

  if (!estadosValidos.includes(estado)) {
    throw new Error('Estado de reserva no válido');
  }

  // Cancelar una reserva requiere permiso específico
  if (estado === 'cancelada') {
    const permitido = await tienePermisoUsuario('reservas.cancelar');

    if (!permitido) {
      throw new Error('No tenés permisos para cancelar reservas.');
    }
  }

  // Confirmar el pago de una reserva requiere permiso específico
  if (estado === 'confirmada') {
    const permitido = await tienePermisoUsuario('pagos.confirmar');

    if (!permitido) {
      throw new Error(
        'No tenés permisos para confirmar el pago de reservas.'
      );
    }
  }

  const supabase = createServerComponentClient({ cookies });

  const { error } = await supabase
    .from('reserva')
    .update({ estado_reserva: estado })
    .eq('id_reserva', id);

  if (error) {
    throw new Error(
      'Error al cambiar el estado de la reserva - Permisos insuficientes'
    );
  }

  revalidatePath('/reservas');

  return true;
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

// Recursos activos y disponibles para reservar.
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
  const permitido = await tienePermisoUsuario('reservas.crear');

  if (!permitido) {
    throw new Error('No tenés permisos para crear reservas.');
  }

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
export async function actualizarReservaRecurso(
  id: number,
  datos: NuevaReservaRecursoInput
) {
  const permitido = await tienePermisoUsuario('reservas.editar');

  if (!permitido) {
    throw new Error('No tenés permisos para editar reservas.');
  }

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
// DASHBOARD (modelo recurso).
// ============================================================================

// Elimina una reserva del nuevo modelo basado en `recurso`.
export async function eliminarReservaRecurso(id: number) {
  const permitido = await tienePermisoUsuario('reservas.eliminar');

  if (!permitido) {
    throw new Error('No tenés permisos para eliminar reservas.');
  }

  const supabase = createServerComponentClient({ cookies });

  const { data: reserva, error: errorConsulta } = await supabase
    .from('reserva')
    .select('id_reserva, id_recurso')
    .eq('id_reserva', id)
    .maybeSingle();

  if (errorConsulta) {
    throw new Error(
      `Error al buscar la reserva antes de eliminarla: ${errorConsulta.message}`
    );
  }

  if (!reserva) {
    throw new Error('La reserva no existe.');
  }

  const { error } = await supabase
    .from('reserva')
    .delete()
    .eq('id_reserva', id)
    .eq('id_recurso', reserva.id_recurso);

  if (error) {
    throw new Error(`Error al eliminar la reserva: ${error.message}`);
  }

  revalidatePath('/reservas');

  return true;
}

export async function obtenerPermisosReservas() {
  const puedeEliminar = await tienePermisoUsuario('reservas.eliminar');
  const puedeCancelar = await tienePermisoUsuario('reservas.cancelar');

  return {
    puedeEliminar,
    puedeCancelar,
  };
}

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

// KPIs del dashboard usando `recurso` para disponibilidad.
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
// agnóstico del recurso ya que solo agrupa por reserva.hora_inicio.
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



