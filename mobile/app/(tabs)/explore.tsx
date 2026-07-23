import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, { FadeInDown, FadeOutLeft, LinearTransition } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Archive, SearchX } from 'lucide-react-native';

import { HistoryFilters, type HistoryFiltersValue } from '@/components/HistoryFilters';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { ArtifactCard } from '@/components/ArtifactCard';
import { EmptyState } from '@/components/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { useArtifactsQuery } from '@/hooks/useArtifactsQuery';
import { useArchiveStore } from '@/store/archiveStore';
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

function ArchiveAction({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="ml-2 items-center justify-center rounded-2xl bg-down/15"
      style={{ width: 72 }}
    >
      <Archive size={22} color="#EF4444" />
      <Text className="mt-1 text-xs font-semibold text-down">Архив</Text>
    </Pressable>
  );
}

export default function HistoryScreen() {
  const { data: artifacts, isLoading, isFetching, refetch } = useArtifactsQuery();
  const [filters, setFilters] = useState<HistoryFiltersValue>({ dateRange: 'all', type: null, rarity: null });
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const archivedIds = useArchiveStore((s) => s.archivedIds);
  const archiveArtifact = useArchiveStore((s) => s.archive);
  const unarchiveArtifact = useArchiveStore((s) => s.unarchive);
  const toast = useToast();

  const filtered = useMemo(() => {
    const all = artifacts ?? [];
    return all
      .filter((a) => !archivedIds.includes(a.id))
      .filter((a) => matchesFilters(a, filters))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [artifacts, filters, archivedIds]);

  const visible = filtered.slice(0, visibleCount);

  const handleArchive = (artifact: OsgardArtifact) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    archiveArtifact(artifact.id);
    toast.show(`«${artifact.name}» отправлен в архив`, 'default', {
      label: 'Восстановить',
      onPress: () => unarchiveArtifact(artifact.id),
    });
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <LoadingAnimation label="Загрузка артефактов" />
      </SafeAreaView>
    );
  }

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
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, flexGrow: 1 }}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.delay(Math.min(index, 12) * 60).springify().damping(16)}
            exiting={FadeOutLeft.duration(220)}
            layout={LinearTransition.duration(220)}
            style={{ flex: 1 }}
          >
            <Swipeable
              renderRightActions={() => <ArchiveAction onPress={() => handleArchive(item)} />}
              overshootRight={false}
            >
              <ArtifactCard artifact={item} onPress={() => router.push(`/result/${item.id}`)} />
            </Swipeable>
          </Animated.View>
        )}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
        onEndReachedThreshold={0.4}
        onEndReached={() => setVisibleCount((c) => Math.min(c + PAGE_SIZE, filtered.length))}
        ListEmptyComponent={
          <EmptyState
            icon={SearchX}
            title="Артефакты не найдены"
            description="Попробуйте изменить фильтры или создайте первый артефакт"
            style={{ flex: 1, justifyContent: 'center' }}
          />
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
