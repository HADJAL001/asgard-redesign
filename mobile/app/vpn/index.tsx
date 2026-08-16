import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Server,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  Clock,
  Wifi,
  MapPin,
  RefreshCw,
} from 'lucide-react-native';

import { colors } from '@/design-system/colors';
import { useVpn } from '@/hooks/useVpn';
import { VpnServer } from '@/modules/gard-core/src';

// Демо-серверы для тестирования
const DEMO_SERVERS: VpnServer[] = [
  {
    id: 'nl-ams-1',
    name: 'Amsterdam #1',
    location: 'Netherlands',
    host: 'nl-ams-1.gard.vpn',
    port: 51820,
    publicKey: 'demo-public-key-nl-ams-1',
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
    publicKey: 'demo-public-key-de-fra-1',
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
    publicKey: 'demo-public-key-de-nur-1',
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
    publicKey: 'demo-public-key-fi-hel-1',
    load: 25,
    latencyMs: 48,
    status: 'online',
  },
];

export default function VpnScreen() {
  const {
    state,
    stats,
    formattedStats,
    selectedServer,
    error,
    isLoading,
    isConnected,
    isConnecting,
    isDisconnecting,
    toggle,
    selectServer,
    clearError,
  } = useVpn();

  const [servers, setServers] = useState<VpnServer[]>(DEMO_SERVERS);
  const [showServerList, setShowServerList] = useState(false);
  const [pulseAnim] = useState(new Animated.Value(1));

  // Анимация пульсации при подключении
  useEffect(() => {
    if (isConnecting) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isConnecting]);

  // Получение иконки статуса
  const getStatusIcon = () => {
    if (isConnected) {
      return <ShieldCheck size={80} color={colors.gold} />;
    } else if (isConnecting || isDisconnecting) {
      return <Shield size={80} color={colors.goldLight} />;
    } else {
      return <ShieldOff size={80} color={colors.textSecondary} />;
    }
  };

  // Получение текста статуса
  const getStatusText = () => {
    switch (state.status) {
      case 'connected':
        return 'Защищено';
      case 'connecting':
        return 'Подключение...';
      case 'disconnecting':
        return 'Отключение...';
      case 'error':
        return 'Ошибка';
      default:
        return 'Не защищено';
    }
  };

  // Получение цвета статуса
  const getStatusColor = () => {
    switch (state.status) {
      case 'connected':
        return colors.gold;
      case 'connecting':
      case 'disconnecting':
        return colors.goldLight;
      case 'error':
        return '#FF6B6B';
      default:
        return colors.textSecondary;
    }
  };

  // Обработка выбора сервера
  const handleServerSelect = (server: VpnServer) => {
    selectServer(server);
    setShowServerList(false);
  };

  // Обработка подключения
  const handleToggle = async () => {
    if (!selectedServer && !isConnected) {
      setShowServerList(true);
      return;
    }
    await toggle();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'GARD VPN',
          headerStyle: { backgroundColor: colors.navy },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Главная кнопка подключения */}
        <View style={styles.mainSection}>
          <TouchableOpacity
            style={styles.connectButton}
            onPress={handleToggle}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.connectButtonInner,
                isConnected && styles.connectButtonConnected,
                { transform: [{ scale: pulseAnim }] },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator size="large" color={colors.gold} />
              ) : (
                getStatusIcon()
              )}
            </Animated.View>
          </TouchableOpacity>

          <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {getStatusText()}
          </Text>

          {error && (
            <TouchableOpacity onPress={clearError} style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Выбранный сервер */}
        <TouchableOpacity
          style={styles.serverCard}
          onPress={() => setShowServerList(!showServerList)}
          activeOpacity={0.7}
        >
          <View style={styles.serverCardLeft}>
            <Server size={24} color={colors.gold} />
            <View style={styles.serverInfo}>
              <Text style={styles.serverName}>
                {selectedServer?.name || 'Выберите сервер'}
              </Text>
              {selectedServer && (
                <View style={styles.serverLocation}>
                  <MapPin size={14} color={colors.textSecondary} />
                  <Text style={styles.serverLocationText}>
                    {selectedServer.location}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <ChevronRight size={24} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Список серверов */}
        {showServerList && (
          <View style={styles.serverList}>
            <Text style={styles.serverListTitle}>Доступные серверы</Text>
            {servers.map((server) => (
              <TouchableOpacity
                key={server.id}
                style={[
                  styles.serverItem,
                  selectedServer?.id === server.id && styles.serverItemSelected,
                ]}
                onPress={() => handleServerSelect(server)}
                activeOpacity={0.7}
              >
                <View style={styles.serverItemLeft}>
                  <Server
                    size={20}
                    color={
                      selectedServer?.id === server.id
                        ? colors.gold
                        : colors.textSecondary
                    }
                  />
                  <View style={styles.serverItemInfo}>
                    <Text style={styles.serverItemName}>{server.name}</Text>
                    <Text style={styles.serverItemLocation}>{server.location}</Text>
                  </View>
                </View>
                <View style={styles.serverItemRight}>
                  <View style={styles.serverItemStats}>
                    <Wifi size={14} color={colors.textSecondary} />
                    <Text style={styles.serverItemLatency}>
                      {server.latencyMs}ms
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.serverLoadBar,
                      { width: `${server.load}%` },
                      server.load > 70 && styles.serverLoadHigh,
                    ]}
                  />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Статистика (только при подключении) */}
        {isConnected && (
          <View style={styles.statsSection}>
            <Text style={styles.statsSectionTitle}>Статистика</Text>

            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <ArrowDown size={20} color={colors.cyan} />
                <Text style={styles.statValue}>{formattedStats.bytesIn}</Text>
                <Text style={styles.statLabel}>Загружено</Text>
              </View>

              <View style={styles.statCard}>
                <ArrowUp size={20} color={colors.goldLight} />
                <Text style={styles.statValue}>{formattedStats.bytesOut}</Text>
                <Text style={styles.statLabel}>Отправлено</Text>
              </View>

              <View style={styles.statCard}>
                <Clock size={20} color={colors.gold} />
                <Text style={styles.statValue}>{formattedStats.duration}</Text>
                <Text style={styles.statLabel}>Время</Text>
              </View>

              <View style={styles.statCard}>
                <Wifi size={20} color={colors.cyan} />
                <Text style={styles.statValue}>{formattedStats.latency}</Text>
                <Text style={styles.statLabel}>Пинг</Text>
              </View>
            </View>
          </View>
        )}

        {/* Информация о подключении */}
        {isConnected && state.serverHost && (
          <View style={styles.connectionInfo}>
            <Text style={styles.connectionInfoTitle}>Подключение</Text>
            <View style={styles.connectionInfoRow}>
              <Text style={styles.connectionInfoLabel}>Сервер:</Text>
              <Text style={styles.connectionInfoValue}>{state.serverHost}</Text>
            </View>
            <View style={styles.connectionInfoRow}>
              <Text style={styles.connectionInfoLabel}>Порт:</Text>
              <Text style={styles.connectionInfoValue}>{state.serverPort}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.navy,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  mainSection: {
    alignItems: 'center',
    marginBottom: 30,
  },
  connectButton: {
    marginBottom: 20,
  },
  connectButtonInner: {
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: colors.darkCard,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: colors.textSecondary,
  },
  connectButtonConnected: {
    borderColor: colors.gold,
    shadowColor: colors.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  statusText: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorContainer: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
  },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.darkCard,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  serverCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serverInfo: {
    marginLeft: 12,
  },
  serverName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  serverLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  serverLocationText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginLeft: 4,
  },
  serverList: {
    backgroundColor: colors.darkCard,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  serverListTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  serverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  serverItemSelected: {
    backgroundColor: 'rgba(212, 175, 55, 0.1)',
    marginHorizontal: -16,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  serverItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  serverItemInfo: {
    marginLeft: 12,
  },
  serverItemName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
  },
  serverItemLocation: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  serverItemRight: {
    alignItems: 'flex-end',
  },
  serverItemStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  serverItemLatency: {
    color: colors.textSecondary,
    fontSize: 12,
    marginLeft: 4,
  },
  serverLoadBar: {
    height: 3,
    backgroundColor: colors.gold,
    borderRadius: 2,
    minWidth: 20,
    maxWidth: 60,
  },
  serverLoadHigh: {
    backgroundColor: '#FF6B6B',
  },
  statsSection: {
    marginTop: 10,
  },
  statsSectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48%',
    backgroundColor: colors.darkCard,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: {
    color: colors.text,
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
  },
  statLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  connectionInfo: {
    backgroundColor: colors.darkCard,
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
  },
  connectionInfoTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  connectionInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  connectionInfoLabel: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  connectionInfoValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
