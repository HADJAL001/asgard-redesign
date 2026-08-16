import { NativeModulesProxy, EventEmitter } from 'expo-modules-core';

// Импортируем нативный модуль
const GardCoreModule = NativeModulesProxy.GardCoreModule;

// Создаём EventEmitter для событий
const emitter = new EventEmitter(GardCoreModule as any);

// Тип подписки
export interface Subscription {
  remove: () => void;
}

// ============================================================================
// ТИПЫ
// ============================================================================

/**
 * Состояние VPN подключения
 */
export type VpnStatus = 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'error';

/**
 * Состояние VPN туннеля
 */
export interface VpnState {
  status: VpnStatus;
  serverName?: string;
  serverHost?: string;
  serverPort?: number;
  connectedAt?: number;
  errorMessage?: string;
}

/**
 * Статистика трафика VPN
 */
export interface VpnStats {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  latencyMs: number;
}

/**
 * Информация о VPN сервере
 */
export interface VpnServer {
  id: string;
  name: string;
  location: string;
  host: string;
  port: number;
  publicKey: string;
  load: number;
  latencyMs?: number;
  status?: 'online' | 'offline' | 'maintenance';
}

/**
 * Конфигурация VPN подключения
 */
export interface VpnConfig {
  serverHost: string;
  serverPort: number;
  privateKey: string;
  publicKey: string;
  presharedKey?: string;
  address: string;
  dns?: string;
  allowedIPs: string;
  persistentKeepalive?: number;
}

// ============================================================================
// ФУНКЦИИ
// ============================================================================

/**
 * Подключиться к VPN серверу
 * @param config - конфигурация подключения
 */
export async function connect(config: VpnConfig): Promise<void> {
  const configJSON = JSON.stringify(config);
  return await GardCoreModule.connect(configJSON);
}

/**
 * Отключиться от VPN
 */
export async function disconnect(): Promise<void> {
  return await GardCoreModule.disconnect();
}

/**
 * Получить текущее состояние VPN
 */
export async function getState(): Promise<VpnState> {
  const stateJSON = await GardCoreModule.getState();
  return JSON.parse(stateJSON);
}

/**
 * Получить статистику трафика
 */
export async function getStats(): Promise<VpnStats> {
  const statsJSON = await GardCoreModule.getStats();
  return JSON.parse(statsJSON);
}

/**
 * Проверить, подключен ли VPN
 */
export async function isConnected(): Promise<boolean> {
  return await GardCoreModule.isConnected();
}

/**
 * Получить версию библиотеки
 */
export function getVersion(): string {
  return GardCoreModule.getVersion();
}

/**
 * Генерация пары ключей WireGuard
 * Ключи генерируются полностью на устройстве
 */
export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

/**
 * Сгенерировать новую пару ключей WireGuard
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const keyPairJSON = await GardCoreModule.generateKeyPair();
  return JSON.parse(keyPairJSON);
}

/**
 * Сгенерировать preshared key для дополнительной защиты
 */
export async function generatePresharedKey(): Promise<string> {
  return await GardCoreModule.generatePresharedKey();
}

/**
 * Получить публичный ключ из приватного
 */
export async function getPublicKeyFromPrivate(privateKey: string): Promise<string> {
  return await GardCoreModule.getPublicKeyFromPrivate(privateKey);
}

/**
 * Проверить валидность ключа
 */
export async function validateKey(key: string): Promise<boolean> {
  return await GardCoreModule.validateKey(key);
}

/**
 * Запросить разрешение VPN (Android)
 */
export async function requestVpnPermission(): Promise<boolean> {
  return await GardCoreModule.requestVpnPermission();
}

/**
 * Проверить разрешение VPN
 */
export async function hasVpnPermission(): Promise<boolean> {
  return await GardCoreModule.hasVpnPermission();
}

// ============================================================================
// СОБЫТИЯ
// ============================================================================

/**
 * Подписаться на изменения состояния VPN
 * @param callback - функция обратного вызова
 * @returns функция отписки
 */
export function addStateListener(callback: (state: VpnState) => void): Subscription {
  return (emitter as any).addListener('onStateChange', (event: { state: string }) => {
    const state = JSON.parse(event.state) as VpnState;
    callback(state);
  });
}

/**
 * Подписаться на обновления статистики
 * @param callback - функция обратного вызова
 * @returns функция отписки
 */
export function addStatsListener(callback: (stats: VpnStats) => void): Subscription {
  return (emitter as any).addListener('onStatsUpdate', (event: { stats: string }) => {
    const stats = JSON.parse(event.stats) as VpnStats;
    callback(stats);
  });
}

/**
 * Подписаться на логи
 * @param callback - функция обратного вызова
 * @returns функция отписки
 */
export function addLogListener(callback: (level: number, message: string) => void): Subscription {
  return (emitter as any).addListener('onLog', (event: { level: number; message: string }) => {
    callback(event.level, event.message);
  });
}

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Форматировать байты в читаемый формат
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Форматировать время подключения
 */
export function formatDuration(connectedAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const seconds = now - connectedAt;
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// СЕРВЕРЫ И FAILOVER
// ============================================================================

/**
 * Информация о сервере с расширенными данными
 */
export interface ServerInfo extends VpnServer {
  country: string;
  priority: number;
}

/**
 * Конфигурация автоматического переподключения
 */
export interface FailoverConfig {
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  pingIntervalMs: number;
  switchThresholdMs: number;
}

/**
 * Статус соединения
 */
export interface ConnectionStatus {
  connected: boolean;
  currentServerID: string;
  reconnectCount: number;
  lastReconnect: number;
  monitoring: boolean;
}

/**
 * Установить список серверов
 */
export async function setServers(servers: ServerInfo[]): Promise<void> {
  const serversJSON = JSON.stringify(servers);
  return await GardCoreModule.setServers(serversJSON);
}

/**
 * Получить список серверов
 */
export async function getServers(): Promise<ServerInfo[]> {
  const serversJSON = await GardCoreModule.getServers();
  return JSON.parse(serversJSON);
}

/**
 * Получить лучший сервер (по пингу и нагрузке)
 */
export async function getBestServer(): Promise<ServerInfo> {
  const serverJSON = await GardCoreModule.getBestServer();
  return JSON.parse(serverJSON);
}

/**
 * Получить сервер по ID
 */
export async function getServerById(id: string): Promise<ServerInfo> {
  const serverJSON = await GardCoreModule.getServerById(id);
  return JSON.parse(serverJSON);
}

/**
 * Получить серверы по стране
 */
export async function getServersByCountry(country: string): Promise<ServerInfo[]> {
  const serversJSON = await GardCoreModule.getServersByCountry(country);
  return JSON.parse(serversJSON);
}

/**
 * Пропинговать все серверы
 */
export async function pingAllServers(): Promise<ServerInfo[]> {
  const serversJSON = await GardCoreModule.pingAllServers();
  return JSON.parse(serversJSON);
}

/**
 * Получить серверы по умолчанию (GARD VPN)
 */
export async function getDefaultServers(): Promise<ServerInfo[]> {
  const serversJSON = await GardCoreModule.getDefaultServers();
  return JSON.parse(serversJSON);
}

/**
 * Инициализировать серверы по умолчанию
 */
export async function initDefaultServers(): Promise<void> {
  return await GardCoreModule.initDefaultServers();
}

// ============================================================================
// АВТОМАТИЧЕСКОЕ ПЕРЕПОДКЛЮЧЕНИЕ
// ============================================================================

/**
 * Запустить мониторинг соединения
 */
export async function startConnectionMonitor(serverID: string): Promise<void> {
  return await GardCoreModule.startConnectionMonitor(serverID);
}

/**
 * Остановить мониторинг соединения
 */
export async function stopConnectionMonitor(): Promise<void> {
  return await GardCoreModule.stopConnectionMonitor();
}

/**
 * Получить статус соединения
 */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const statusJSON = await GardCoreModule.getConnectionStatus();
  return JSON.parse(statusJSON);
}

/**
 * Принудительно переподключиться
 */
export async function forceReconnect(): Promise<void> {
  return await GardCoreModule.forceReconnect();
}

/**
 * Переключиться на другой сервер
 */
export async function switchServer(serverID: string): Promise<void> {
  return await GardCoreModule.switchServer(serverID);
}

/**
 * Установить конфигурацию failover
 */
export async function setFailoverConfig(config: FailoverConfig): Promise<void> {
  const configJSON = JSON.stringify(config);
  return await GardCoreModule.setFailoverConfig(configJSON);
}

/**
 * Получить конфигурацию failover
 */
export async function getFailoverConfig(): Promise<FailoverConfig> {
  const configJSON = await GardCoreModule.getFailoverConfig();
  return JSON.parse(configJSON);
}

// ============================================================================
// ПОДПИСКА НА СОБЫТИЯ ПЕРЕПОДКЛЮЧЕНИЯ
// ============================================================================

/**
 * Подписаться на события переподключения
 */
export function addReconnectListener(callback: (event: {
  type: 'reconnect' | 'serverSwitch' | 'connectionLost';
  serverID?: string;
  oldServerID?: string;
  newServerID?: string;
}) => void): Subscription {
  return (emitter as any).addListener('onReconnect', callback);
}

// ============================================================================
// ЭКСПОРТ ПО УМОЛЧАНИЮ
// ============================================================================

export default {
  // Основные функции
  connect,
  disconnect,
  getState,
  getStats,
  isConnected,
  getVersion,
  requestVpnPermission,
  hasVpnPermission,
  
  // Ключи
  generateKeyPair,
  generatePresharedKey,
  getPublicKeyFromPrivate,
  validateKey,
  
  // Серверы
  setServers,
  getServers,
  getBestServer,
  getServerById,
  getServersByCountry,
  pingAllServers,
  getDefaultServers,
  initDefaultServers,
  
  // Failover
  startConnectionMonitor,
  stopConnectionMonitor,
  getConnectionStatus,
  forceReconnect,
  switchServer,
  setFailoverConfig,
  getFailoverConfig,
  
  // События
  addStateListener,
  addStatsListener,
  addLogListener,
  addReconnectListener,
  
  // Утилиты
  formatBytes,
  formatDuration,
};
