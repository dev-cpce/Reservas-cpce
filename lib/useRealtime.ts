import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';
import { 
  RealtimeChannel, 
  RealtimePostgresChangesPayload,
  REALTIME_POSTGRES_CHANGES_LISTEN_EVENT
} from '@supabase/supabase-js';

type TablaSupabase = 'reserva' | 'cancha' | 'recurso' | 'cliente' | 'pago';
type RealtimePayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

interface UseRealtimeOptions {
  tabla: TablaSupabase;
  evento?: REALTIME_POSTGRES_CHANGES_LISTEN_EVENT;
  filtro?: string;
  onInsert?: (payload: RealtimePayload) => void;
  onUpdate?: (payload: RealtimePayload) => void;
  onDelete?: (payload: RealtimePayload) => void;
  autoReconnect?: boolean;
}

interface UseDashboardRealtimeOptions {
  onReservaChange?: () => void;
  onCanchaChange?: () => void;
  onRecursoChange?: () => void;
  onClienteChange?: () => void;
  onPagoChange?: () => void;
  enabled?: boolean;
  autoReconnect?: boolean;
}



interface ChannelInfo {
  channel: RealtimeChannel;
  isConnected: boolean;
  error: string | null;
  reconnectAttempts: number;
  reconnectTimeout: NodeJS.Timeout | null;
  closeTimeout: NodeJS.Timeout | null;
  subscribers: Set<string>;
  callbacks: {
    onInsert: Set<(payload: RealtimePayload) => void>;
    onUpdate: Set<(payload: RealtimePayload) => void>;
    onDelete: Set<(payload: RealtimePayload) => void>;
  };
}

class RealtimeChannelManager {
  private static instance: RealtimeChannelManager | null = null;
  private channels: Map<TablaSupabase, ChannelInfo> = new Map();
  private globalConnectionState = false;
  private lastNotificationState = false;
  private initialized = false;
  private initTimeout: NodeJS.Timeout | null = null;

  static getInstance(): RealtimeChannelManager {
    if (!RealtimeChannelManager.instance) {
      RealtimeChannelManager.instance = new RealtimeChannelManager();
    }
    return RealtimeChannelManager.instance;
  }

  private constructor() {
    this.initTimeout = setTimeout(() => {
      this.initialized = true;
    }, 2000);
  }

  private getOrCreateChannel(tabla: TablaSupabase): ChannelInfo {
    if (this.channels.has(tabla)) {
      return this.channels.get(tabla)!;
    }

    const channelName = `persistent_${tabla}_${Date.now()}`;
    const channel = supabase.channel(channelName);

    const channelInfo: ChannelInfo = {
      channel,
      isConnected: false,
      error: null,
      reconnectAttempts: 0,
      reconnectTimeout: null,
      closeTimeout: null,
      subscribers: new Set(),
      callbacks: {
        onInsert: new Set(),
        onUpdate: new Set(),
        onDelete: new Set()
      }
    };

    this.setupChannelListeners(tabla, channelInfo);
    this.channels.set(tabla, channelInfo);
    this.subscribeChannel(tabla, channelInfo);
    
    return channelInfo;
  }

  private setupChannelListeners(tabla: TablaSupabase, channelInfo: ChannelInfo) {
    const { channel } = channelInfo;

    // Eventos de base de datos usando el método correcto
    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: tabla
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          this.handleDatabaseEvent('INSERT', tabla, payload, channelInfo);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: tabla
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          this.handleDatabaseEvent('UPDATE', tabla, payload, channelInfo);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: tabla
        },
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          this.handleDatabaseEvent('DELETE', tabla, payload, channelInfo);
        }
      );

    // Eventos del sistema
    channel.on('system', {}, (payload: { type?: string; message?: string }) => {
      if (payload.type === 'connected') {
        channelInfo.isConnected = true;
        channelInfo.error = null;
        channelInfo.reconnectAttempts = 0;
        this.clearReconnectTimeout(channelInfo);
        this.updateGlobalConnectionState();
      } else if (payload.type === 'error') {
        channelInfo.isConnected = false;
        channelInfo.error = payload.message || 'Error de conexión';
        this.updateGlobalConnectionState();
      }
    });
  }

  private handleDatabaseEvent(
    event: 'INSERT' | 'UPDATE' | 'DELETE', 
    tabla: TablaSupabase, 
    payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    channelInfo: ChannelInfo
  ) {
    // Solo ejecutar callbacks de componentes - las notificaciones se manejan en hooks específicos
    const callbackSet = event === 'INSERT' ? channelInfo.callbacks.onInsert :
                       event === 'UPDATE' ? channelInfo.callbacks.onUpdate :
                       channelInfo.callbacks.onDelete;

    callbackSet.forEach(callback => {
      try {
        callback(payload);
      } catch {
        // Silencioso en producción
      }
    });
  }

  private subscribeChannel(tabla: TablaSupabase, channelInfo: ChannelInfo) {
    const { channel } = channelInfo;
    
    channel.subscribe((status: string) => {
      switch (status) {
        case 'SUBSCRIBED':
          channelInfo.isConnected = true;
          channelInfo.error = null;
          channelInfo.reconnectAttempts = 0;
          this.clearReconnectTimeout(channelInfo);
          this.updateGlobalConnectionState();
          break;
          
        case 'CHANNEL_ERROR':
        case 'TIMED_OUT':
          channelInfo.isConnected = false;
          channelInfo.error = `Error en canal ${tabla}`;
          this.scheduleReconnect(tabla, channelInfo);
          this.updateGlobalConnectionState();
          break;
          
        case 'CLOSED':
          channelInfo.isConnected = false;
          channelInfo.error = null;
          if (channelInfo.subscribers.size > 0) {
            this.scheduleReconnect(tabla, channelInfo);
          }
          this.updateGlobalConnectionState();
          break;
      }
    });
  }

  private scheduleReconnect(tabla: TablaSupabase, channelInfo: ChannelInfo) {
    if (channelInfo.reconnectTimeout) {
      clearTimeout(channelInfo.reconnectTimeout);
    }

    const delay = Math.min(1000 * Math.pow(2, channelInfo.reconnectAttempts), 30000);
    
    channelInfo.reconnectTimeout = setTimeout(() => {
      channelInfo.reconnectAttempts++;
      
      supabase.removeChannel(channelInfo.channel);
      
      const channelName = `persistent_${tabla}_${Date.now()}_reconnect`;
      const newChannel = supabase.channel(channelName);
      
      channelInfo.channel = newChannel;
      this.setupChannelListeners(tabla, channelInfo);
      this.subscribeChannel(tabla, channelInfo);
      
    }, delay);
  }

  private clearReconnectTimeout(channelInfo: ChannelInfo) {
    if (channelInfo.reconnectTimeout) {
      clearTimeout(channelInfo.reconnectTimeout);
      channelInfo.reconnectTimeout = null;
    }
    if (channelInfo.closeTimeout) {
      clearTimeout(channelInfo.closeTimeout);
      channelInfo.closeTimeout = null;
    }
  }

  private updateGlobalConnectionState() {
    const allChannelsConnected = Array.from(this.channels.values()).every(ch => ch.isConnected);
    const hasActiveChannels = this.channels.size > 0;
    const newState = hasActiveChannels && allChannelsConnected;
    
    this.globalConnectionState = newState;
  }


  subscribe(
    tabla: TablaSupabase, 
    subscriberId: string,
    callbacks: {
      onInsert?: (payload: RealtimePayload) => void;
      onUpdate?: (payload: RealtimePayload) => void;
      onDelete?: (payload: RealtimePayload) => void;
    }
  ) {
    const channelInfo = this.getOrCreateChannel(tabla);
    
    if (channelInfo.closeTimeout) {
      clearTimeout(channelInfo.closeTimeout);
      channelInfo.closeTimeout = null;
    }
    
    channelInfo.subscribers.add(subscriberId);
    
    if (callbacks.onInsert) channelInfo.callbacks.onInsert.add(callbacks.onInsert);
    if (callbacks.onUpdate) channelInfo.callbacks.onUpdate.add(callbacks.onUpdate);
    if (callbacks.onDelete) channelInfo.callbacks.onDelete.add(callbacks.onDelete);
    
    return {
      isConnected: channelInfo.isConnected,
      error: channelInfo.error,
      reconnectAttempts: channelInfo.reconnectAttempts
    };
  }

  unsubscribe(tabla: TablaSupabase, subscriberId: string, callbacks?: {
    onInsert?: (payload: RealtimePayload) => void;
    onUpdate?: (payload: RealtimePayload) => void;
    onDelete?: (payload: RealtimePayload) => void;
  }) {
    const channelInfo = this.channels.get(tabla);
    if (!channelInfo) return;

    channelInfo.subscribers.delete(subscriberId);
    
    if (callbacks?.onInsert) channelInfo.callbacks.onInsert.delete(callbacks.onInsert);
    if (callbacks?.onUpdate) channelInfo.callbacks.onUpdate.delete(callbacks.onUpdate);
    if (callbacks?.onDelete) channelInfo.callbacks.onDelete.delete(callbacks.onDelete);
    
    if (channelInfo.subscribers.size === 0) {
      if (channelInfo.closeTimeout) {
        clearTimeout(channelInfo.closeTimeout);
      }
      
      channelInfo.closeTimeout = setTimeout(() => {
        if (channelInfo.subscribers.size === 0) {
          supabase.removeChannel(channelInfo.channel);
          this.clearReconnectTimeout(channelInfo);
          if (channelInfo.closeTimeout) {
            clearTimeout(channelInfo.closeTimeout);
          }
          this.channels.delete(tabla);
          this.updateGlobalConnectionState();
        }
      }, 30000);
    }
  }

  getConnectionStatus() {
    const connections: Record<string, boolean> = {};
    const errors: string[] = [];
    const reconnectAttempts: Record<string, number> = {};
    
    this.channels.forEach((channelInfo, tabla) => {
      connections[tabla] = channelInfo.isConnected;
      if (channelInfo.error) errors.push(channelInfo.error);
      reconnectAttempts[tabla] = channelInfo.reconnectAttempts;
    });
    
    return {
      isConnected: this.globalConnectionState,
      connections,
      errors,
      reconnectAttempts
    };
  }

  reconnectAll() {
    this.channels.forEach((channelInfo, tabla) => {
      channelInfo.reconnectAttempts = 0;
      channelInfo.error = null;
      this.clearReconnectTimeout(channelInfo);
      this.scheduleReconnect(tabla, channelInfo);
    });
  }

  disconnectAll() {
    this.channels.forEach((channelInfo) => {
      supabase.removeChannel(channelInfo.channel);
      this.clearReconnectTimeout(channelInfo);
    });
    this.channels.clear();
    this.globalConnectionState = false;
    
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
    
    this.updateGlobalConnectionState();
  }

  resetNotificationState() {
    this.lastNotificationState = false;
    this.initialized = false;
    
    if (this.initTimeout) {
      clearTimeout(this.initTimeout);
    }
    this.initTimeout = setTimeout(() => {
      this.initialized = true;
    }, 1000);
  }
}



const channelManager = RealtimeChannelManager.getInstance();

const useRealtimeSubscription = (options: UseRealtimeOptions) => {
  const [connectionInfo, setConnectionInfo] = useState({
    isConnected: false,
    error: null as string | null,
    reconnectAttempts: 0
  });
  
  const { tabla, onInsert, onUpdate, onDelete } = options;
  const subscriberIdRef = useRef<string>(`${tabla}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const isFirstMount = useRef(true);
  
  const onInsertRef = useRef(onInsert);
  const onUpdateRef = useRef(onUpdate);
  const onDeleteRef = useRef(onDelete);
  
  useEffect(() => {
    onInsertRef.current = onInsert;
    onUpdateRef.current = onUpdate;
    onDeleteRef.current = onDelete;
  }, [onInsert, onUpdate, onDelete]);

  const updateConnectionState = useCallback(() => {
    const status = channelManager.getConnectionStatus();
    setConnectionInfo({
      isConnected: status.connections[tabla] || false,
      error: status.errors.find(err => err.includes(tabla)) || null,
      reconnectAttempts: status.reconnectAttempts[tabla] || 0
    });
  }, [tabla]);

  useEffect(() => {
    const subscriberId = subscriberIdRef.current;
    
    if (isFirstMount.current) {
      channelManager.resetNotificationState();
      isFirstMount.current = false;
    }
    
    const callbacks = {
      onInsert: onInsertRef.current ? (payload: RealtimePayload) => {
        setTimeout(() => onInsertRef.current?.(payload), 0);
      } : undefined,
      onUpdate: onUpdateRef.current ? (payload: RealtimePayload) => {
        setTimeout(() => onUpdateRef.current?.(payload), 0);
      } : undefined,
      onDelete: onDeleteRef.current ? (payload: RealtimePayload) => {
        setTimeout(() => onDeleteRef.current?.(payload), 0);
      } : undefined,
    };
    
    const initialStatus = channelManager.subscribe(tabla, subscriberId, callbacks);
    
    setConnectionInfo({
      isConnected: initialStatus.isConnected,
      error: initialStatus.error,
      reconnectAttempts: initialStatus.reconnectAttempts
    });
    
    return () => {
      channelManager.unsubscribe(tabla, subscriberId, callbacks);
    };
  }, [tabla, updateConnectionState]);

  return {
    isConnected: connectionInfo.isConnected,
    error: connectionInfo.error,
    reconnectAttempts: connectionInfo.reconnectAttempts,
    disconnect: () => {
      const subscriberId = subscriberIdRef.current;
      channelManager.unsubscribe(tabla, subscriberId);
    },
    reconnect: () => {
      channelManager.reconnectAll();
    }
  };
};



export const useRealtimeReservas = (onUpdate?: (payload: RealtimePayload) => void) => {
  return useRealtimeSubscription({
    tabla: 'reserva',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate
  });
};

export const useRealtimeCanchas = (onUpdate?: (payload: RealtimePayload) => void) => {
  return useRealtimeSubscription({
    tabla: 'cancha',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate
  });
};

// Recurso: reemplaza a useRealtimeCanchas para el Dashboard migrado (esta se mantiene intacta).
export const useRealtimeRecursos = (onUpdate?: (payload: RealtimePayload) => void) => {
  return useRealtimeSubscription({
    tabla: 'recurso',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate
  });
};

export const useRealtimeClientes = (onUpdate?: (payload: RealtimePayload) => void) => {
  return useRealtimeSubscription({
    tabla: 'cliente',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate
  });
};

export const useRealtimePagos = (onUpdate?: (payload: RealtimePayload) => void) => {
  return useRealtimeSubscription({
    tabla: 'pago',
    onInsert: onUpdate,
    onUpdate: onUpdate,
    onDelete: onUpdate
  });
};



export const useDashboardRealtime = (options: UseDashboardRealtimeOptions) => {
  const { onReservaChange, onCanchaChange, onRecursoChange, onClienteChange, onPagoChange, enabled = true } = options;

  const reservaSubscription = useRealtimeReservas(onReservaChange ? () => {
    setTimeout(() => onReservaChange(), 50);
  } : undefined);

  const canchaSubscription = useRealtimeCanchas(onCanchaChange ? () => {
    setTimeout(() => onCanchaChange(), 50);
  } : undefined);

  const recursoSubscription = useRealtimeRecursos(onRecursoChange ? () => {
    setTimeout(() => onRecursoChange(), 50);
  } : undefined);

  const clienteSubscription = useRealtimeClientes(onClienteChange ? () => {
    setTimeout(() => onClienteChange(), 50);
  } : undefined);

  const pagoSubscription = useRealtimePagos(onPagoChange ? () => {
    setTimeout(() => onPagoChange(), 50);
  } : undefined);

  const isConnected = enabled && (
    reservaSubscription.isConnected && 
    canchaSubscription.isConnected &&
    recursoSubscription.isConnected &&
    clienteSubscription.isConnected &&
    pagoSubscription.isConnected
  );

  const errors = [
    reservaSubscription.error, 
    canchaSubscription.error,
    recursoSubscription.error,
    clienteSubscription.error,
    pagoSubscription.error
  ].filter(Boolean);

  return {
    isConnected,
    errors,
    connections: {
      reservas: reservaSubscription.isConnected,
      canchas: canchaSubscription.isConnected,
      recursos: recursoSubscription.isConnected,
      clientes: clienteSubscription.isConnected,
      pagos: pagoSubscription.isConnected,
    },
    reconnectAttempts: {
      reservas: reservaSubscription.reconnectAttempts,
      canchas: canchaSubscription.reconnectAttempts,
      recursos: recursoSubscription.reconnectAttempts,
      clientes: clienteSubscription.reconnectAttempts,
      pagos: pagoSubscription.reconnectAttempts,
    },
    disconnect: () => {
      reservaSubscription.disconnect();
      canchaSubscription.disconnect();
      recursoSubscription.disconnect();
      clienteSubscription.disconnect();
      pagoSubscription.disconnect();
    },
    reconnect: () => {
      reservaSubscription.reconnect();
      canchaSubscription.reconnect();
      recursoSubscription.reconnect();
      clienteSubscription.reconnect();
      pagoSubscription.reconnect();
    }
  };
};

// Aliases para compatibilidad
export const disconnectAllRealtime = () => {
  channelManager.disconnectAll();
};

export const reconnectAllRealtime = () => {
  channelManager.reconnectAll();
};

export { useRealtimeSubscription };
export default useRealtimeSubscription;