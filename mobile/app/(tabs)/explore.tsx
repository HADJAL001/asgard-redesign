import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HistoryFilters, type HistoryFiltersValue } from '@/components/HistoryFilters';
import { rarityMeta, typeMeta } from '@/lib/economy';
import { useArtifactsQuery } from '@/hooks/useArtifactsQuery';
import type { OsgardArtifact } from '@/types/artifact';

const PAGE_SIZE = 20;

const RANGE_MS: Record<string, number> = {
  today: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
};

function matchesFilters(artifact: OsgardArtifact, filters: HistoryFiltersValue): boolean {
  if (filters.type && artifact.type !== filters.type) return false;
  if (filters.rarity && artifact.rarity !== filters.rarity) return false;
  if (filters.dateRange !== 'all') {
    const maxAge = RANGE_MS[filters.dateRange];
    if (Date.now() - artifact.createdAt > maxAge) return false;
  }
  return true;
}

function HistoryRow({ artifact }: { artifact: OsgardArtifact }) {
  const rarity = rarityMeta(artifact.rarity);
  const type = typeMeta(artifact.type);
  const Icon = type.Icon;
  const date = new Date(artifact.createdAt).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <Pressable
      testID="history-item"
      onPress={() => router.push(`/result/${artifact.id}`)}
      className="flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <View
        className="h-11 w-11 items-center justify-center rounded-full"
        style={{ backgroundColor: `${rarity.color}22` }}
      >
        <Icon size={20} color={rarity.color} />
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-white" numberOfLines={1}>
          {artifact.name}
        </Text>
        <Text className="text-xs text-muted">
          {type.label} · {date}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text style={{ color: rarity.color }} className="text-xs font-semibold">
          {rarity.symbol} {rarity.label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const { data: artifacts, isLoading, isFetching, refetch } = useArtifactsQuery();
  const [filters, setFilters] = useState<HistoryFiltersValue>({ dateRange: 'all', type: null, rarity: null });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const all = artifacts ?? [];
    return all.filter((a) => matchesFilters(a, filters)).sort((a, b) => b.createdAt - a.createdAt);
  }, [artifacts, filters]);

  const visible = filtered.slice(0, visibleCount);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="gap-3 px-4 pb-3 pt-2">
        <Text className="text-2xl font-bold text-white">История</Text>
        <HistoryFilters
          value={filters}
          onChange={(next) => {
            setFilters(next);
            setVisibleCount(PAGE_SIZE);
          }}
        />
      </View>
      <FlatList
        testID="history-list"
        data={visible}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, flexGrow: 1 }}
        renderItem={({ item }) => <HistoryRow artifact={item} />}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20">
            <Text className="text-muted">
              {isLoading ? 'Загрузка…' : 'Артефакты не найдены'}
            </Text>
          </View>
        }
        ListFooterComponent={
          visible.length < filtered.length ? (
            <Text className="py-2 text-center text-xs text-muted">Загружаем ещё…</Text>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
