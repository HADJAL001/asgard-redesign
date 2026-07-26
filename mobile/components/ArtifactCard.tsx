import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Hammer } from 'lucide-react-native';

import { PremiumSurface } from '@/components/ui/PremiumSurface';
import { rarityMeta, typeMeta } from '@/lib/economy';
import { useSharedElementTransition } from '@/hooks/useSharedElementTransition';
import { typography } from '@/design-system/typography';
import { colors } from '@/design-system/colors';
import type { OsgardArtifact } from '@/types/artifact';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ArtifactCardProps = {
  artifact: OsgardArtifact;
  onPress?: () => void;
  onDetails?: () => void;
  /** Надет ли артефакт в снаряжение Кузницы (см. ForgeLoadoutPanel) — экраны без лоадаута не передают. */
  equipped?: boolean;
  /** Заняты ли все слоты снаряжения — блокирует "Надеть" у ещё не надетых артефактов. */
  slotsFull?: boolean;
  onEquip?: () => void;
  onUnequip?: () => void;
};

/**
 * Карточка артефакта. Реального изображения у артефактов нет (backend отдаёт только
 * текстовые поля description/lore/aiVisual — см. mobile/README.md) — вместо фото
 * используем градиентную "подложку" в цвете редкости с крупной иконкой типа.
 */
export function ArtifactCard({
  artifact,
  onPress,
  onDetails,
  equipped = false,
  slotsFull = false,
  onEquip,
  onUnequip,
}: ArtifactCardProps) {
  const rarity = rarityMeta(artifact.rarity);
  const type = typeMeta(artifact.type);
  const Icon = type.Icon;
  const scale = useSharedValue(1);
  const transition = useSharedElementTransition(artifact.id);
  // Кнопка Кузницы доступна только для артефактов "не в продаже" (status === 'kept') — те же
  // условия, что и на вебе (components/artifacts-view.tsx), и только если экран её вообще завёл.
  const showLoadoutAction = artifact.status === 'kept' && (onEquip || onUnequip);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      testID="artifact-card"
      sharedTransitionTag={transition.sharedTransitionTag}
      sharedTransitionStyle={transition.sharedTransitionStyle}
      style={[{ borderRadius: 20 }, animatedStyle]}
      onPressIn={() => {
        scale.value = withTiming(0.95, { duration: 100 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 100 });
      }}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${artifact.name}, редкость: ${rarity.label}${equipped ? ', надет в снаряжение Кузницы' : ''}`}
    >
      <PremiumSurface style={{ borderWidth: 1, borderColor: equipped ? colors.gold : 'rgba(136,146,208,0.18)' }}>
        <View className="bg-card">
          <LinearGradient
            colors={[`${rarity.color}55`, `${rarity.color}00`]}
            style={{ height: 96, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon size={48} color={rarity.color} strokeWidth={1.5} />
          </LinearGradient>

          <View className="gap-2 p-3">
            <Text style={typography.title as object} className="text-white" numberOfLines={1}>
              {artifact.name}
            </Text>

            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-1.5">
                <View
                  className="rounded-full px-2 py-0.5"
                  style={{ backgroundColor: `${rarity.color}22` }}
                >
                  <Text style={[typography.label as object, { color: rarity.color }]}>
                    {rarity.symbol} {rarity.label}
                  </Text>
                </View>
                {equipped && (
                  <View
                    className="flex-row items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ backgroundColor: `${colors.gold}22` }}
                  >
                    <Hammer size={9} color={colors.gold} strokeWidth={1.75} />
                    <Text style={[typography.label as object, { color: colors.gold, fontSize: 9 }]}>Надет</Text>
                  </View>
                )}
              </View>

              <Pressable
                onPress={onDetails ?? onPress}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Подробнее об артефакте ${artifact.name}`}
              >
                <Text className="text-xs font-semibold text-accent">Подробнее</Text>
              </Pressable>
            </View>

            {showLoadoutAction && (
              <Pressable
                onPress={equipped ? onUnequip : onEquip}
                disabled={!equipped && slotsFull}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={equipped ? 'Снять со снаряжения Кузницы' : 'Надеть в снаряжение Кузницы'}
                className="flex-row items-center justify-center gap-1.5 rounded-lg py-1.5"
                style={{
                  borderWidth: 1,
                  borderColor: equipped ? colors.gold : `${colors.gold}55`,
                  backgroundColor: equipped ? `${colors.gold}1A` : 'transparent',
                  opacity: !equipped && slotsFull ? 0.4 : 1,
                }}
              >
                <Hammer size={12} color={colors.gold} strokeWidth={1.75} />
                <Text style={{ color: colors.gold }} className="text-[11px] font-medium">
                  {equipped ? 'Снять' : 'Надеть'}
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      </PremiumSurface>
    </AnimatedPressable>
  );
}
