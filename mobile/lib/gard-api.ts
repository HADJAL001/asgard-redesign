/**
 * GARD API Client
 * Клиент для работы с GARD VPN API
 */

import { apiClient } from './api-client';
import { VpnServer, VpnConfig } from '@/modules/gard-core/src';

// ============================================================================
// ТИПЫ
// ============================================================================

/**
 * Ответ со списком серверов
 */
export interface ServersResponse {
  servers: VpnServer[];
}

/**
 * Ответ с конфигурацией VPN
 */
export interface VpnConfigResponse {
  privateKey: string;
  address: string;
  dns: string;
  allowedIPs: string;
  persistentKeepalive: number;
}

/**
 * Запрос на генерацию конфигурации
 */
export interface GenerateConfigRequest {
  serverId: string;
}

/**
 * Статус подписки VPN
 */
export interface VpnSubscription {
  active: boolean;
  plan: 'free' | 'premium' | 'unlimited';
  expiresAt?: number;
  dataLimit?: number;
  dataUsed?: number;
}

/**
 * Статистика использования VPN
 */
export interface VpnUsageStats {
  totalBytesIn: number;
  totalBytesOut: number;
  totalConnections: number;
  lastConnectedAt?: number;
  favoriteServer?: string;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

const GARD_API_BASE = process.env.EXPO_PUBLIC_GARD_API_URL || 'https://api.gard.vpn';

/**
 * Получить список доступных VPN серверов
 */
export async function getServers(): Promise<VpnServer[]> {
  try {
    const response = await fetch(`${GARD_API_BASE}/api/servers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch servers: ${response.status}`);
    }

    const data: ServersResponse = await response.json();
    return data.servers;
  } catch (error) {
    console.error('Error fetching servers:', error);
    throw error;
  }
}

/**
 * Получить конфигурацию для подключения к серверу
 */
export async function getServerConfig(serverId: string): Promise<VpnConfigResponse> {
  try {
    const response = await fetch(`${GARD_API_BASE}/api/configs/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ serverId }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate config: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating config:', error);
    throw error;
  }
}

/**
 * Получить полную конфигурацию VPN для сервера
 */
export async function getFullVpnConfig(server: VpnServer): Promise<VpnConfig> {
  const configResponse = await getServerConfig(server.id);

  return {
    serverHost: server.host,
    serverPort: server.port,
    publicKey: server.publicKey,
    privateKey: configResponse.privateKey,
    address: configResponse.address,
    dns: configResponse.dns,
    allowedIPs: configResponse.allowedIPs,
    persistentKeepalive: configResponse.persistentKeepalive,
  };
}

/**
 * Проверить пинг до сервера
 */
export async function pingServer(serverId: string): Promise<number> {
  const start = Date.now();

  try {
    const response = await fetch(`${GARD_API_BASE}/api/servers/${serverId}/ping`, {
      method: 'GET',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Ping failed: ${response.status}`);
    }

    return Date.now() - start;
  } catch (error) {
    console.error('Error pinging server:', error);
    return -1;
  }
}

/**
 * Получить статус подписки VPN
 */
export async function getSubscription(): Promise<VpnSubscription> {
  try {
    const response = await fetch(`${GARD_API_BASE}/api/subscription`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch subscription: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching subscription:', error);
    // Возвращаем бесплатный план по умолчанию
    return {
      active: true,
      plan: 'free',
      dataLimit: 500 * 1024 * 1024, // 500 MB
      dataUsed: 0,
    };
  }
}

/**
 * Получить статистику использования VPN
 */
export async function getUsageStats(): Promise<VpnUsageStats> {
  try {
    const response = await fetch(`${GARD_API_BASE}/api/usage`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch usage stats: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching usage stats:', error);
    return {
      totalBytesIn: 0,
      totalBytesOut: 0,
      totalConnections: 0,
    };
  }
}

/**
 * Отправить статистику сессии
 */
export async function reportSession(sessionData: {
  serverId: string;
  bytesIn: number;
  bytesOut: number;
  duration: number;
  startedAt: number;
  endedAt: number;
}): Promise<void> {
  try {
    await fetch(`${GARD_API_BASE}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(sessionData),
    });
  } catch (error) {
    console.error('Error reporting session:', error);
    // Не выбрасываем ошибку - это не критично
  }
}

/**
 * Обновить список серверов с пингами
 */
export async function getServersWithPing(): Promise<VpnServer[]> {
  const servers = await getServers();

  // Параллельно пингуем все серверы
  const pingPromises = servers.map(async (server) => {
    const latency = await pingServer(server.id);
    return {
      ...server,
      latencyMs: latency > 0 ? latency : undefined,
    };
  });

  return Promise.all(pingPromises);
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Получить заголовки авторизации
 */
function getAuthHeaders(): Record<string, string> {
  // TODO: Интеграция с authStore для получения токена
  // const token = useAuthStore.getState().token;
  const token = ''; // Заглушка

  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  return {};
}

/**
 * Демо-серверы для тестирования без API
 */
export const DEMO_SERVERS: VpnServer[] = [
  {
    id: 'nl-ams-1',
    name: 'Amsterdam #1',
    location: 'Netherlands',
    host: 'nl-ams-1.gard.vpn',
    port: 51820,
    publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    load: 45,
    latencyMs: 32,
    status: 'online',
  },
  {
    id: 'de-fra-1',
    name: 'Frankfurt #1',
    location: 'Germany',
    host: 'de-fra-1.gard.vpn',
    port: 51820,
    publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    load: 62,
    latencyMs: 28,
    status: 'online',
  },
  {
    id: 'de-nur-1',
    name: 'Nuremberg #1',
    location: 'Germany',
    host: 'de-nur-1.gard.vpn',
    port: 51820,
    publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    load: 38,
    latencyMs: 35,
    status: 'online',
  },
  {
    id: 'fi-hel-1',
    name: 'Helsinki #1',
    location: 'Finland',
    host: 'fi-hel-1.gard.vpn',
    port: 51820,
    publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    load: 25,
    latencyMs: 48,
    status: 'online',
  },
  {
    id: 'us-nyc-1',
    name: 'New York #1',
    location: 'United States',
    host: 'us-nyc-1.gard.vpn',
    port: 51820,
    publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    load: 55,
    latencyMs: 120,
    status: 'online',
  },
  {
    id: 'jp-tky-1',
    name: 'Tokyo #1',
    location: 'Japan',
    host: 'jp-tky-1.gard.vpn',
    port: 51820,
    publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
    load: 30,
    latencyMs: 180,
    status: 'online',
  },
];

/**
 * Демо-конфигурация для тестирования
 */
export function getDemoConfig(server: VpnServer): VpnConfig {
  return {
    serverHost: server.host,
    serverPort: server.port,
    publicKey: server.publicKey,
    privateKey: 'cHJpdmF0ZS1rZXktZGVtby1mb3ItdGVzdGluZy1vbmx5', // Demo key
    address: '10.0.0.2/32',
    dns: '1.1.1.1',
    allowedIPs: '0.0.0.0/0',
    persistentKeepalive: 25,
  };
}

export default {
  getServers,
  getServerConfig,
  getFullVpnConfig,
  pingServer,
  getSubscription,
  getUsageStats,
  reportSession,
  getServersWithPing,
  DEMO_SERVERS,
  getDemoConfig,
};
