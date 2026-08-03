import { useState, useEffect, useCallback, useRef } from 'react';
import GardCore, {
  VpnState,
  VpnStats,
  VpnServer,
  VpnConfig,
  addStateListener,
  addStatsListener,
  formatBytes,
  formatDuration,
} from '../modules/gard-core/src';

/**
 * useVpn - React hook для управления VPN подключением
 * 
 * Предоставляет полный API для работы с GARD VPN:
 * - Подключение/отключение
 * - Отслеживание состояния
 * - Статистика трафика
 * - Выбор сервера
 */
export function useVpn() {
  // Состояние VPN
  const [state, setState] = useState<VpnState>({
    status: 'disconnected',
  });
  
  // Статистика
  const [stats, setStats] = useState<VpnStats>({
    bytesIn: 0,
    bytesOut: 0,
    packetsIn: 0,
    packetsOut: 0,
    latencyMs: 0,
  });
  
  // Выбранный сервер
  const [selectedServer, setSelectedServer] = useState<VpnServer | null>(null);
  
  // Ошибка
  const [error, setError] = useState<string | null>(null);
  
  // Загрузка
  const [isLoading, setIsLoading] = useState(false);
  
  // Ref для отслеживания монтирования
  const isMounted = useRef(true);
  
  // Подписка на события
  useEffect(() => {
    isMounted.current = true;
    
    // Подписываемся на изменения состояния
    const stateSubscription = addStateListener((newState) => {
      if (isMounted.current) {
        setState(newState);
        
        // Сбрасываем ошибку при успешном подключении
        if (newState.status === 'connected') {
          setError(null);
        }
        
        // Устанавливаем ошибку
        if (newState.status === 'error' && newState.errorMessage) {
          setError(newState.errorMessage);
        }
      }
    });
    
    // Подписываемся на статистику
    const statsSubscription = addStatsListener((newStats) => {
      if (isMounted.current) {
        setStats(newStats);
      }
    });
    
    // Загружаем начальное состояние
    loadInitialState();
    
    return () => {
      isMounted.current = false;
      stateSubscription.remove();
      statsSubscription.remove();
    };
  }, []);
  
  // Загрузка начального состояния
  const loadInitialState = async () => {
    try {
      const currentState = await GardCore.getState();
      if (isMounted.current) {
        setState(currentState);
      }
    } catch (e) {
      console.error('Failed to load VPN state:', e);
    }
  };
  
  // Подключение к VPN
  const connect = useCallback(async (server?: VpnServer, config?: Partial<VpnConfig>) => {
    const targetServer = server || selectedServer;
    
    if (!targetServer) {
      setError('Сервер не выбран');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Проверяем разрешение VPN
      const hasPermission = await GardCore.hasVpnPermission();
      if (!hasPermission) {
        const granted = await GardCore.requestVpnPermission();
        if (!granted) {
          throw new Error('VPN permission denied');
        }
      }
      
      // Формируем конфигурацию
      const vpnConfig: VpnConfig = {
        serverHost: targetServer.host,
        serverPort: targetServer.port,
        publicKey: targetServer.publicKey,
        privateKey: config?.privateKey || '', // Должен быть получен от API
        address: config?.address || '10.0.0.2/32',
        dns: config?.dns || '1.1.1.1',
        allowedIPs: config?.allowedIPs || '0.0.0.0/0',
        persistentKeepalive: config?.persistentKeepalive || 25,
        ...config,
      };
      
      await GardCore.connect(vpnConfig);
      
      if (server) {
        setSelectedServer(server);
      }
    } catch (e: any) {
      const errorMessage = e.message || 'Ошибка подключения';
      setError(errorMessage);
      console.error('VPN connect error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [selectedServer]);
  
  // Отключение от VPN
  const disconnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await GardCore.disconnect();
    } catch (e: any) {
      const errorMessage = e.message || 'Ошибка отключения';
      setError(errorMessage);
      console.error('VPN disconnect error:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Переключение VPN (connect/disconnect)
  const toggle = useCallback(async (server?: VpnServer) => {
    if (state.status === 'connected' || state.status === 'connecting') {
      await disconnect();
    } else {
      await connect(server);
    }
  }, [state.status, connect, disconnect]);
  
  // Выбор сервера
  const selectServer = useCallback((server: VpnServer) => {
    setSelectedServer(server);
  }, []);
  
  // Форматированная статистика
  const formattedStats = {
    bytesIn: formatBytes(stats.bytesIn),
    bytesOut: formatBytes(stats.bytesOut),
    total: formatBytes(stats.bytesIn + stats.bytesOut),
    latency: `${stats.latencyMs} ms`,
    duration: state.connectedAt ? formatDuration(state.connectedAt) : '0:00',
  };
  
  // Проверки состояния
  const isConnected = state.status === 'connected';
  const isConnecting = state.status === 'connecting';
  const isDisconnecting = state.status === 'disconnecting';
  const isDisconnected = state.status === 'disconnected';
  const hasError = state.status === 'error';
  
  return {
    // Состояние
    state,
    stats,
    formattedStats,
    selectedServer,
    error,
    isLoading,
    
    // Проверки
    isConnected,
    isConnecting,
    isDisconnecting,
    isDisconnected,
    hasError,
    
    // Действия
    connect,
    disconnect,
    toggle,
    selectServer,
    
    // Утилиты
    clearError: () => setError(null),
  };
}

export default useVpn;
