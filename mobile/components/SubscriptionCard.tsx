import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Check, Crown } from 'lucide-react-native';

import { Card } from '@/components/ui/Card';
import { colors } from '@/design-system/colors';
import { cn } from '@/lib/utils';

export type SubscriptionTier = {
  id: string;
  label: string;
  /** Pre-formatted price string from the backend (e.g. "500 ∞ / мес") — not computed here. */
  priceLabel: string;
  benefits: string[];
  color: string;
  /** Elite tiers get the gold glow treatment, same visual language as CURRENCIES.timecoin in lib/economy.ts. */
  elite?: boolean;
};

type SubscriptionCardProps = {
  tier: SubscriptionTier;
  isActive: boolean;
  onPress?: () => void;
};

/** Tactile premium-tier card — all copy/pricing/benefits come from the tier prop, nothing is fabricated here. */
export function SubscriptionCard({ tier, isActive, onPress }: SubscriptionCardProps) {
  const handlePress = () => {
    if (!onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <Pressable onPress={handlePress} disabled={!onPress}>
      <Card
        accentColor={isActive ? tier.color : undefined}
        className={cn('gap-3', tier.elite && 'bg-navy')}
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-1.5">
            {tier.elite ? <Crown size={16} color={colors.gold} /> : null}
            <Text className="text-lg font-bold text-white">{tier.label}</Text>
          </View>
          {isActive ? (
            <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${tier.color}22` }}>
              <Check size={12} color={tier.color} />
              <Text style={{ color: tier.color }} className="text-xs font-semibold">
                Активна
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={{ color: tier.color }} className="text-base font-semibold">
          {tier.priceLabel}
        </Text>

        <View className="gap-1.5">
          {tier.benefits.map((benefit) => (
            <View key={benefit} className="flex-row items-center gap-2">
              <View className="h-1 w-1 rounded-full" style={{ backgroundColor: tier.color }} />
              <Text className="flex-1 text-sm text-muted">{benefit}</Text>
            </View>
          ))}
        </View>
      </Card>
    </Pressable>
  );
}
