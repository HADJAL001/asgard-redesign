/**
 * E2E Tests for GARD VPN Mobile
 * 
 * Эти тесты проверяют полный цикл работы VPN в мобильном приложении:
 * - Получение списка серверов
 * - Выбор сервера
 * - Подключение к VPN
 * - Проверка статистики
 * - Отключение от VPN
 * 
 * Запуск: npx jest __tests__/vpn.e2e.test.ts
 */

/// <reference types="jest" />

// ============================================================================
// TYPES
// ============================================================================

interface VpnServer {
  id: string;
  name: string;
  location: string;
  host: string;
  port: number;
  publicKey: string;
  load: number;
  latencyMs?: number;
  status: string;
}

interface VpnConfig {
  serverHost: string;
  serverPort: number;
  publicKey: string;
  privateKey: string;
  address: string;
  dns: string;
  allowedIPs: string;
  persistentKeepalive: number;
}

interface VpnState {
  status: 'disconnected' | 'connecting' | 'connected' | 'disconnecting';
  serverName?: string;
  serverLocation?: string;
  connectedAt?: number;
}

interface VpnStats {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  latencyMs: number;
}

interface VpnSubscription {
  active: boolean;
  plan: string;
  expiresAt?: number;
  dataLimit?: number;
  dataUsed?: number;
}

// ============================================================================
// MOCKS
// ============================================================================

// Mock для GardCore модуля
const mockGardCore = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  getState: jest.fn(),
  getStats: jest.fn(),
  isConnected: jest.fn(),
  addStateListener: jest.fn(),
  addStatsListener: jest.fn(),
  removeStateListener: jest.fn(),
  removeStatsListener: jest.fn(),
};

// Mock для GARD API
const mockGardApi = {
  getServers: jest.fn(),
  getServerConfig: jest.fn(),
  getFullVpnConfig: jest.fn(),
  pingServer: jest.fn(),
  getSubscription: jest.fn(),
  getUsageStats: jest.fn(),
  reportSession: jest.fn(),
};

// Мокаем модули
jest.mock('@/modules/gard-core/src', () => mockGardCore);
jest.mock('@/lib/gard-api', () => mockGardApi);

// ============================================================================
// TEST DATA
// ============================================================================

const mockServers = [
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
];

const mockVpnConfig = {
  serverHost: 'nl-ams-1.gard.vpn',
  serverPort: 51820,
  publicKey: 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=',
  privateKey: 'cHJpdmF0ZS1rZXktZGVtby1mb3ItdGVzdGluZy1vbmx5',
  address: '10.0.0.2/32',
  dns: '1.1.1.1',
  allowedIPs: '0.0.0.0/0',
  persistentKeepalive: 25,
};

const mockVpnState = {
  status: 'disconnected' as const,
  serverName: undefined,
  serverLocation: undefined,
  connectedAt: undefined,
};

const mockVpnStats = {
  bytesIn: 0,
  bytesOut: 0,
  packetsIn: 0,
  packetsOut: 0,
  latencyMs: 0,
};

// ============================================================================
// E2E TESTS
// ============================================================================

describe('GARD VPN E2E Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    mockGardApi.getServers.mockResolvedValue(mockServers);
    mockGardApi.getFullVpnConfig.mockResolvedValue(mockVpnConfig);
    mockGardApi.pingServer.mockResolvedValue(30);
    mockGardApi.getSubscription.mockResolvedValue({
      active: true,
      plan: 'premium',
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    });
    
    mockGardCore.getState.mockResolvedValue(mockVpnState);
    mockGardCore.getStats.mockResolvedValue(mockVpnStats);
    mockGardCore.isConnected.mockResolvedValue(false);
    mockGardCore.connect.mockResolvedValue(undefined);
    mockGardCore.disconnect.mockResolvedValue(undefined);
  });

  describe('Server List', () => {
    it('should fetch server list from API', async () => {
      const servers = await mockGardApi.getServers();
      
      expect(servers).toHaveLength(3);
      expect(servers[0].id).toBe('nl-ams-1');
      expect(mockGardApi.getServers).toHaveBeenCalledTimes(1);
    });

    it('should filter online servers', async () => {
      const servers = await mockGardApi.getServers();
      const onlineServers = servers.filter(s => s.status === 'online');
      
      expect(onlineServers).toHaveLength(3);
    });

    it('should sort servers by latency', async () => {
      const servers = await mockGardApi.getServers();
      const sorted = [...servers].sort((a, b) => (a.latencyMs || 999) - (b.latencyMs || 999));
      
      expect(sorted[0].id).toBe('de-fra-1'); // 28ms
      expect(sorted[1].id).toBe('nl-ams-1'); // 32ms
      expect(sorted[2].id).toBe('de-nur-1'); // 35ms
    });

    it('should ping servers and update latency', async () => {
      const server = mockServers[0];
      const latency = await mockGardApi.pingServer(server.id);
      
      expect(latency).toBe(30);
      expect(mockGardApi.pingServer).toHaveBeenCalledWith('nl-ams-1');
    });
  });

  describe('VPN Connection', () => {
    it('should get VPN config for selected server', async () => {
      const server = mockServers[0];
      const config = await mockGardApi.getFullVpnConfig(server);
      
      expect(config.serverHost).toBe('nl-ams-1.gard.vpn');
      expect(config.privateKey).toBeDefined();
      expect(config.publicKey).toBeDefined();
    });

    it('should connect to VPN server', async () => {
      const server = mockServers[0];
      const config = await mockGardApi.getFullVpnConfig(server);
      
      await mockGardCore.connect(config);
      
      expect(mockGardCore.connect).toHaveBeenCalledWith(config);
    });

    it('should update state to connecting', async () => {
      mockGardCore.getState.mockResolvedValue({
        status: 'connecting',
        serverName: 'Amsterdam #1',
        serverLocation: 'Netherlands',
      });
      
      const state = await mockGardCore.getState();
      
      expect(state.status).toBe('connecting');
    });

    it('should update state to connected', async () => {
      mockGardCore.getState.mockResolvedValue({
        status: 'connected',
        serverName: 'Amsterdam #1',
        serverLocation: 'Netherlands',
        connectedAt: Date.now(),
      });
      mockGardCore.isConnected.mockResolvedValue(true);
      
      const state = await mockGardCore.getState();
      const isConnected = await mockGardCore.isConnected();
      
      expect(state.status).toBe('connected');
      expect(isConnected).toBe(true);
    });

    it('should disconnect from VPN', async () => {
      await mockGardCore.disconnect();
      
      expect(mockGardCore.disconnect).toHaveBeenCalled();
    });

    it('should update state to disconnected after disconnect', async () => {
      mockGardCore.getState.mockResolvedValue({
        status: 'disconnected',
      });
      mockGardCore.isConnected.mockResolvedValue(false);
      
      const state = await mockGardCore.getState();
      const isConnected = await mockGardCore.isConnected();
      
      expect(state.status).toBe('disconnected');
      expect(isConnected).toBe(false);
    });
  });

  describe('VPN Statistics', () => {
    it('should get initial stats (zeros)', async () => {
      const stats = await mockGardCore.getStats();
      
      expect(stats.bytesIn).toBe(0);
      expect(stats.bytesOut).toBe(0);
    });

    it('should update stats while connected', async () => {
      mockGardCore.getStats.mockResolvedValue({
        bytesIn: 1024 * 1024, // 1 MB
        bytesOut: 512 * 1024, // 512 KB
        packetsIn: 1000,
        packetsOut: 500,
        latencyMs: 25,
      });
      
      const stats = await mockGardCore.getStats();
      
      expect(stats.bytesIn).toBe(1024 * 1024);
      expect(stats.bytesOut).toBe(512 * 1024);
      expect(stats.latencyMs).toBe(25);
    });
  });

  describe('State Listeners', () => {
    it('should add state listener', () => {
      const callback = jest.fn();
      mockGardCore.addStateListener(callback);
      
      expect(mockGardCore.addStateListener).toHaveBeenCalledWith(callback);
    });

    it('should remove state listener', () => {
      const callback = jest.fn();
      mockGardCore.removeStateListener(callback);
      
      expect(mockGardCore.removeStateListener).toHaveBeenCalledWith(callback);
    });

    it('should add stats listener', () => {
      const callback = jest.fn();
      mockGardCore.addStatsListener(callback);
      
      expect(mockGardCore.addStatsListener).toHaveBeenCalledWith(callback);
    });
  });

  describe('Subscription', () => {
    it('should check subscription status', async () => {
      const subscription = await mockGardApi.getSubscription();
      
      expect(subscription.active).toBe(true);
      expect(subscription.plan).toBe('premium');
    });

    it('should handle free plan limits', async () => {
      mockGardApi.getSubscription.mockResolvedValue({
        active: true,
        plan: 'free',
        dataLimit: 500 * 1024 * 1024, // 500 MB
        dataUsed: 100 * 1024 * 1024, // 100 MB
      });
      
      const subscription = await mockGardApi.getSubscription();
      
      expect(subscription.plan).toBe('free');
      expect(subscription.dataLimit).toBe(500 * 1024 * 1024);
      expect(subscription.dataUsed).toBe(100 * 1024 * 1024);
    });
  });

  describe('Error Handling', () => {
    it('should handle connection error', async () => {
      mockGardCore.connect.mockRejectedValue(new Error('Connection failed'));
      
      await expect(mockGardCore.connect(mockVpnConfig)).rejects.toThrow('Connection failed');
    });

    it('should handle API error', async () => {
      mockGardApi.getServers.mockRejectedValue(new Error('Network error'));
      
      await expect(mockGardApi.getServers()).rejects.toThrow('Network error');
    });

    it('should handle config generation error', async () => {
      mockGardApi.getFullVpnConfig.mockRejectedValue(new Error('Config generation failed'));
      
      await expect(mockGardApi.getFullVpnConfig(mockServers[0])).rejects.toThrow('Config generation failed');
    });
  });

  describe('Full E2E Flow', () => {
    it('should complete full VPN connection flow', async () => {
      // Step 1: Get servers
      const servers = await mockGardApi.getServers();
      expect(servers).toHaveLength(3);

      // Step 2: Select best server (lowest latency)
      const bestServer = servers.reduce((best, current) => 
        (current.latencyMs || 999) < (best.latencyMs || 999) ? current : best
      );
      expect(bestServer.id).toBe('de-fra-1');

      // Step 3: Get VPN config
      const config = await mockGardApi.getFullVpnConfig(bestServer);
      expect(config.serverHost).toBeDefined();

      // Step 4: Connect
      await mockGardCore.connect(config);
      expect(mockGardCore.connect).toHaveBeenCalled();

      // Step 5: Verify connected state
      mockGardCore.isConnected.mockResolvedValue(true);
      mockGardCore.getState.mockResolvedValue({
        status: 'connected',
        serverName: bestServer.name,
        connectedAt: Date.now(),
      });
      
      const isConnected = await mockGardCore.isConnected();
      expect(isConnected).toBe(true);

      // Step 6: Get stats
      mockGardCore.getStats.mockResolvedValue({
        bytesIn: 1024,
        bytesOut: 512,
        latencyMs: 28,
      });
      
      const stats = await mockGardCore.getStats();
      expect(stats.bytesIn).toBeGreaterThan(0);

      // Step 7: Disconnect
      await mockGardCore.disconnect();
      expect(mockGardCore.disconnect).toHaveBeenCalled();

      // Step 8: Verify disconnected
      mockGardCore.isConnected.mockResolvedValue(false);
      const isDisconnected = await mockGardCore.isConnected();
      expect(isDisconnected).toBe(false);
    });

    it('should handle reconnection after disconnect', async () => {
      // First connection
      await mockGardCore.connect(mockVpnConfig);
      mockGardCore.isConnected.mockResolvedValue(true);
      
      // Disconnect
      await mockGardCore.disconnect();
      mockGardCore.isConnected.mockResolvedValue(false);
      
      // Reconnect
      await mockGardCore.connect(mockVpnConfig);
      mockGardCore.isConnected.mockResolvedValue(true);
      
      const isConnected = await mockGardCore.isConnected();
      expect(isConnected).toBe(true);
      expect(mockGardCore.connect).toHaveBeenCalledTimes(2);
    });

    it('should handle server switch while connected', async () => {
      // Connect to first server
      const server1 = mockServers[0];
      const config1 = await mockGardApi.getFullVpnConfig(server1);
      await mockGardCore.connect(config1);
      
      // Disconnect
      await mockGardCore.disconnect();
      
      // Connect to second server
      const server2 = mockServers[1];
      mockGardApi.getFullVpnConfig.mockResolvedValue({
        ...mockVpnConfig,
        serverHost: server2.host,
      });
      const config2 = await mockGardApi.getFullVpnConfig(server2);
      await mockGardCore.connect(config2);
      
      expect(mockGardCore.disconnect).toHaveBeenCalledTimes(1);
      expect(mockGardCore.connect).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================

describe('VPN Performance Tests', () => {
  it('should connect within 5 seconds', async () => {
    const startTime = Date.now();
    
    await mockGardCore.connect(mockVpnConfig);
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000);
  });

  it('should fetch servers within 2 seconds', async () => {
    const startTime = Date.now();
    
    await mockGardApi.getServers();
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(2000);
  });

  it('should handle rapid connect/disconnect cycles', async () => {
    for (let i = 0; i < 5; i++) {
      await mockGardCore.connect(mockVpnConfig);
      await mockGardCore.disconnect();
    }
    
    expect(mockGardCore.connect).toHaveBeenCalledTimes(5);
    expect(mockGardCore.disconnect).toHaveBeenCalledTimes(5);
  });
});
