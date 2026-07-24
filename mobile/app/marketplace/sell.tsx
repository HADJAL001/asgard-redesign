import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PackageOpen } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { EmptyState } from '@/components/EmptyState';
import { LoadingAnimation } from '@/components/LoadingAnimation';

import { useArtifactsQuery } from '@/hooks/useArtifactsQuery';
import { useCreateListingMutation } from '@/hooks/useCreateListingMutation';
import { rarityMeta, typeMeta, CURRENCY_ORDER, CURRENCIES, defaultListCurrency, type CurrencyId } from '@/lib/economy';
import { ApiError } from '@/lib/api-client';
import type { OsgardArtifact, ArtifactRarity } from '@/types/artifact';

export default function SellArtifactScreen() {
  const { data: artifacts, isLoading } = useArtifactsQuery();
  const createListing = useCreateListingMutation();
  const toast = useToast();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState<CurrencyId | null>(null);

  const sellable = useMemo(() => (artifacts ?? []).filter((a) => a.status === 'kept'), [artifacts]);
  const selected = sellable.find((a) => a.id === selectedId) ?? null;
  const activeCurrency = currency ?? (selected ? defaultListCurrency(selected.rarity as ArtifactRarity) : 'credits');

  const parsedPrice = Number(price.replace(',', '.'));
  const canSubmit = !!selected && price.trim().length > 0 && parsedPrice > 0;

  const handleSelect = (artifact: OsgardArtifact) => {
    setSelectedId(artifact.id);
    setCurrency(null);
    setPrice('');
  };

  const handleSubmit = async () => {
    if (!selected || !canSubmit) return;
    try {
      await createListing.mutateAsync({ artifactId: selected.id, price: parsedPrice, currency: activeCurrency });
      toast.show('Лот выставлен на продажу', 'success');
      router.back();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : 'Не удалось выставить лот', 'error');
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <LoadingAnimation label="Загрузка артефактов" />
      </SafeAreaView>
    );
  }

  if (sellable.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
        <EmptyState
          icon={PackageOpen}
          title="Нечего продавать"
          description="Все ваши артефакты уже выставлены на продажу или проданы"
          style={{ flex: 1, justifyContent: 'center' }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text className="text-sm font-medium text-muted">Выберите артефакт</Text>
        <View className="gap-2">
          {sellable.map((artifact) => {
            const rarity = rarityMeta(artifact.rarity);
            const type = typeMeta(artifact.type);
            const Icon = type.Icon;
            const isSelected = selectedId === artifact.id;
            return (
              <Pressable key={artifact.id} onPress={() => handleSelect(artifact)}>
                <Card accentColor={isSelected ? rarity.color : undefined} className="flex-row items-center gap-3">
                  <Icon size={28} color={rarity.color} strokeWidth={1.5} />
                  <View className="flex-1">
                    <Text className="font-semibold text-white" numberOfLines={1}>
                      {artifact.name}
                    </Text>
                    <Text className="text-xs" style={{ color: rarity.color }}>
                      {rarity.symbol} {rarity.label}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        {selected ? (
          <Card className="gap-3">
            <Text className="text-sm font-medium text-muted">Валюта продажи</Text>
            <View className="flex-row flex-wrap gap-2">
              {CURRENCY_ORDER.map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant={activeCurrency === id ? 'primary' : 'secondary'}
                  onPress={() => setCurrency(id)}
                >
                  {`${CURRENCIES[id].symbol} ${CURRENCIES[id].label}`}
                </Button>
              ))}
            </View>

            <Input
              label={`Цена в ${CURRENCIES[activeCurrency].label.toLowerCase()}`}
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
              placeholder="0"
            />

            <Button disabled={!canSubmit} loading={createListing.isPending} onPress={handleSubmit}>
              Выставить на продажу
            </Button>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
