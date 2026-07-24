import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Store, SearchX } from 'lucide-react-native';

import { MarketplaceFilters, type MarketplaceFiltersValue } from '@/components/MarketplaceFilters';
import { MarketplaceListingCard } from '@/components/MarketplaceListingCard';
import { LoadingAnimation } from '@/components/LoadingAnimation';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useMarketplaceQuery } from '@/hooks/useMarketplaceQuery';
import { useBuyListingMutation } from '@/hooks/useBuyListingMutation';
import { ApiError } from '@/lib/api-client';
import type { MarketListing } from '@/types/market';

function matchesFilters(listing: MarketListing, filters: MarketplaceFiltersValue): boolean {
  if (filters.type && listing.artifactType !== filters.type) return false;
  if (filters.rarity && listing.rarity !== filters.rarity) return false;
  return true;
}

export default function MarketplaceScreen() {
  const { data: listings, isLoading, isFetching, refetch } = useMarketplaceQuery();
  const [filters, setFilters] = useState<MarketplaceFiltersValue>({ type: null, rarity: null, sort: 'price_asc' });
  const [buyingId, setBuyingId] = useState<MarketListing['id'] | null>(null);

  const buyListing = useBuyListingMutation();
  const toast = useToast();

  const visible = useMemo(() => {
    const filtered = (listings ?? []).filter((l) => matchesFilters(l, filters));
    return filtered.sort((a, b) => (filters.sort === 'price_asc' ? a.price - b.price : b.price - a.price));
  }, [listings, filters]);

  const handleBuy = async (listing: MarketListing) => {
    setBuyingId(listing.id);
    try {
      await buyListing.mutateAsync(listing.id);
      toast.show(`Куплен «${listing.artifactName}»`, 'success');
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось купить артефакт', 'error');
    } finally {
      setBuyingId(null);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <LoadingAnimation label="Загрузка маркетплейса" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <View className="gap-3 px-4 pb-3 pt-2">
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-white">Маркетплейс</Text>
          <Button size="sm" variant="secondary" onPress={() => router.push('/marketplace/sell')}>
            Продать
          </Button>
        </View>
        <MarketplaceFilters value={filters} onChange={setFilters} />
      </View>
      <FlatList
        testID="marketplace-list"
        data={visible}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={{ gap: 10 }}
        contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 10, flexGrow: 1 }}
        renderItem={({ item, index }) => (
          <Animated.View
            entering={FadeInDown.delay(Math.min(index, 12) * 60).springify().damping(16)}
            layout={LinearTransition.duration(220)}
            style={{ flex: 1 }}
          >
            <MarketplaceListingCard
              listing={item}
              buying={buyingId === item.id}
              onBuy={() => handleBuy(item)}
            />
          </Animated.View>
        )}
        refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          <EmptyState
            icon={visible.length === 0 && (listings ?? []).length > 0 ? SearchX : Store}
            title={(listings ?? []).length > 0 ? 'Лоты не найдены' : 'Маркетплейс пуст'}
            description={
              (listings ?? []).length > 0
                ? 'Попробуйте изменить фильтры'
                : 'Станьте первым, кто выставит артефакт на продажу'
            }
            actionLabel={(listings ?? []).length === 0 ? 'Продать артефакт' : undefined}
            onAction={(listings ?? []).length === 0 ? () => router.push('/marketplace/sell') : undefined}
            style={{ flex: 1, justifyContent: 'center' }}
          />
        }
      />
    </SafeAreaView>
  );
}
