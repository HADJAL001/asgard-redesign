import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import {
  getServers,
  getServersWithPing,
  pingServer,
  DEMO_SERVERS,
} from '@/lib/gard-api';
import { VpnServer } from '@/modules/gard-core/src';

/**
 * useServers - React hook для работы со списком VPN серверов
 * 
 * Предоставляет:
 * - Загрузку списка серверов
 * - Пинг серверов
 * - Сортировку и фильтрацию
 * - Кэширование
 */
export function useServers() {
  const queryClient = useQueryClient();
  const [sortBy, setSortBy] = useState<'latency' | 'load' | 'name'>('latency');
  const [filterLocation, setFilterLocation] = useState<string | null>(null);

  // Запрос списка серверов
  const {
    data: servers = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['vpn-servers'],
    queryFn: async () => {
      try {
        // Пробуем получить серверы с API
        const serversWithPing = await getServersWithPing();
        return serversWithPing;
      } catch (e) {
        // Если API недоступен, используем демо-серверы
        console.warn('Using demo servers:', e);
        return DEMO_SERVERS;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 минут
    gcTime: 30 * 60 * 1000, // 30 минут (ранее cacheTime)
    retry: 2,
  });

  // Мутация для пинга конкретного сервера
  const pingMutation = useMutation({
    mutationFn: async (serverId: string) => {
      const latency = await pingServer(serverId);
      return { serverId, latency };
    },
    onSuccess: ({ serverId, latency }) => {
      // Обновляем кэш с новым пингом
      queryClient.setQueryData<VpnServer[]>(['vpn-servers'], (old) => {
        if (!old) return old;
        return old.map((server) =>
          server.id === serverId
            ? { ...server, latencyMs: latency > 0 ? latency : undefined }
            : server
        );
      });
    },
  });

  // Обновить пинги всех серверов
  const refreshPings = useCallback(async () => {
    const pingPromises = servers.map((server) =>
      pingMutation.mutateAsync(server.id).catch(() => null)
    );
    await Promise.all(pingPromises);
  }, [servers, pingMutation]);

  // Получить уникальные локации
  const locations = [...new Set(servers.map((s) => s.location))].sort();

  // Отфильтрованные серверы
  const filteredServers = filterLocation
    ? servers.filter((s) => s.location === filterLocation)
    : servers;

  // Отсортированные серверы
  const sortedServers = [...filteredServers].sort((a, b) => {
    switch (sortBy) {
      case 'latency':
        // Серверы без пинга в конец
        if (!a.latencyMs && !b.latencyMs) return 0;
        if (!a.latencyMs) return 1;
        if (!b.latencyMs) return -1;
        return a.latencyMs - b.latencyMs;
      case 'load':
        return a.load - b.load;
      case 'name':
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  // Лучший сервер (минимальный пинг и нагрузка)
  const bestServer = sortedServers.find(
    (s) => s.status === 'online' && s.load < 80
  ) || sortedServers[0];

  // Серверы по регионам
  const serversByRegion = servers.reduce<Record<string, VpnServer[]>>(
    (acc, server) => {
      const region = server.location;
      if (!acc[region]) {
        acc[region] = [];
      }
      acc[region].push(server);
      return acc;
    },
    {}
  );

  // Онлайн серверы
  const onlineServers = servers.filter((s) => s.status === 'online');

  return {
    // Данные
    servers: sortedServers,
    allServers: servers,
    bestServer,
    locations,
    serversByRegion,
    onlineServers,

    // Состояние загрузки
    isLoading,
    isFetching,
    isError,
    error,

    // Сортировка и фильтрация
    sortBy,
    setSortBy,
    filterLocation,
    setFilterLocation,

    // Действия
    refetch,
    refreshPings,
    pingServer: (serverId: string) => pingMutation.mutate(serverId),
    isPinging: pingMutation.isPending,
  };
}

export default useServers;
