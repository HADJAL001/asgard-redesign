import { Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { PremiumSurface } from '@/components/ui/PremiumSurface';
import { Button } from '@/components/ui/Button';
import { rarityMeta, typeMeta, STAT_META, CURRENCIES, type CurrencyId } from '@/lib/economy';
import { typography } from '@/design-system/typography';
import type { MarketListing } from '@/types/market';

type MarketplaceListingCardProps = {
  listing: MarketListing;
  onBuy: () => void;
  buying?: boolean;
};

export function MarketplaceListingCard({ listing, onBuy, buying }: MarketplaceListingCardProps) {
  const rarity = rarityMeta(listing.rarity);
  const type = typeMeta(listing.artifactType);
  const Icon = type.Icon;
  const currency = CURRENCIES[listing.currency as CurrencyId] ?? CURRENCIES.credits;

  return (
    <PremiumSurface style={{ borderWidth: 1, borderColor: 'rgba(136,146,208,0.18)' }}>
      <View className="bg-card">
        <LinearGradient
          colors={[`${rarity.color}55`, `${rarity.color}00`]}
          style={{ height: 88, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon size={44} color={rarity.color} strokeWidth={1.5} />
        </LinearGradient>

        <View className="gap-2 p-3">
          <Text style={typography.title as object} className="text-white" numberOfLines={1}>
            {listing.artifactName}
          </Text>

          <View
            className="self-start rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${rarity.color}22` }}
          >
            <Text style={[typography.label as object, { color: rarity.color }]}>
              {rarity.symbol} {rarity.label}
            </Text>
          </View>

          <View className="flex-row flex-wrap gap-x-3 gap-y-1">
            {STAT_META.map(({ key, label, Icon: StatIcon }) => (
              <View key={key} className="flex-row items-center gap-1">
                <StatIcon size={12} color="#8A8A9A" />
                <Text className="text-xs text-muted">
                  {label} {listing[key]}
                </Text>
              </View>
            ))}
          </View>

          <Text className="text-xs text-muted" numberOfLines={1}>
            Продавец: {listing.sellerDisplayName ?? listing.sellerUsername}
          </Text>

          <View className="flex-row items-center justify-between pt-1">
            <View className="flex-row items-center gap-1">
              <currency.Icon size={16} color={currency.color} />
              <Text className="text-base font-bold" style={{ color: currency.color }}>
                {listing.price}
              </Text>
            </View>
            <Button size="sm" variant="primary" loading={buying} onPress={onBuy}>
              Купить
            </Button>
          </View>
        </View>
      </View>
    </PremiumSurface>
  );
}
