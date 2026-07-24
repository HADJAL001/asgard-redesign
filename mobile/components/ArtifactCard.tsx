import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { PremiumSurface } from '@/components/ui/PremiumSurface';
import { rarityMeta, typeMeta } from '@/lib/economy';
import { useSharedElementTransition } from '@/hooks/useSharedElementTransition';
import { typography } from '@/design-system/typography';
import type { OsgardArtifact } from '@/types/artifact';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ArtifactCardProps = {
  artifact: OsgardArtifact;
  onPress?: () => void;
  onDetails?: () => void;
};

/**
 * Карточка артефакта. Реального изображения у артефактов нет (backend отдаёт только
 * текстовые поля description/lore/aiVisual — см. mobile/README.md) — вместо фото
 * используем градиентную "подложку" в цвете редкости с крупной иконкой типа.
 */
export function ArtifactCard({ artifact, onPress, onDetails }: ArtifactCardProps) {
  const rarity = rarityMeta(artifact.rarity);
  const type = typeMeta(artifact.type);
  const Icon = type.Icon;
  const scale = useSharedValue(1);
  const transition = useSharedElementTransition(artifact.id);

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
    >
      <PremiumSurface style={{ borderWidth: 1, borderColor: 'rgba(136,146,208,0.18)' }}>
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
              <View
                className="rounded-full px-2 py-0.5"
                style={{ backgroundColor: `${rarity.color}22` }}
              >
                <Text style={[typography.label as object, { color: rarity.color }]}>
                  {rarity.symbol} {rarity.label}
                </Text>
              </View>

              <Pressable onPress={onDetails ?? onPress} hitSlop={8}>
                <Text className="text-xs font-semibold text-accent">Подробнее</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </PremiumSurface>
    </AnimatedPressable>
  );
}
