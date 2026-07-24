import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Text, View } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { rarityMeta } from '@/lib/economy';
import { colors } from '@/design-system/colors';
import { InfinityForgeSymbol } from '@/components/InfinityForgeSymbol';

export type ForgePhase = 'idle' | 'charging' | 'burst' | 'reveal';

const RARE_REVEAL_RARITIES = new Set(['epic', 'legendary', 'mythic']);

const PHASE_LABEL: Record<Exclude<ForgePhase, 'idle'>, string> = {
  charging: 'Заряжаем ядро…',
  burst: 'Синтезируем артефакт…',
  reveal: 'Готово!',
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.().then(setReduced);
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => sub?.remove?.();
  }, []);
  return reduced;
}

export function GenerationProgress({ phase, rarity }: { phase: ForgePhase; rarity?: string }) {
  const reducedMotion = useReducedMotion();
  const shockScale = useSharedValue(1);
  const shockOpacity = useSharedValue(0);

  const isRareReveal = phase === 'reveal' && !!rarity && RARE_REVEAL_RARITIES.has(rarity);
  const accentColor = isRareReveal ? rarityMeta(rarity!).color : colors.cyan;

  useEffect(() => {
    if (phase === 'idle' || reducedMotion) {
      cancelAnimation(shockScale);
      cancelAnimation(shockOpacity);
      return;
    }
    if (phase === 'reveal' && isRareReveal) {
      shockScale.value = 1;
      shockOpacity.value = 0.8;
      shockScale.value = withTiming(2.4, { duration: 650, easing: Easing.out(Easing.ease) });
      shockOpacity.value = withTiming(0, { duration: 650 });
    }
  }, [phase, reducedMotion, isRareReveal]);

  const shockStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shockScale.value }],
    opacity: reducedMotion ? 0 : shockOpacity.value,
    borderColor: accentColor,
  }));

  if (phase === 'idle') return null;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-bg/90 px-8">
        <View className="h-28 w-40 items-center justify-center">
          {isRareReveal ? (
            <Animated.View
              pointerEvents="none"
              style={[shockStyle, { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 2 }]}
            />
          ) : null}
          <InfinityForgeSymbol phase={phase} color={accentColor} reducedMotion={reducedMotion} />
        </View>
        <Text
          className="mt-6 text-center text-base font-semibold"
          style={{ color: isRareReveal ? accentColor : '#FFFFFF' }}
        >
          {isRareReveal ? `${rarityMeta(rarity!).label} артефакт!` : PHASE_LABEL[phase]}
        </Text>
      </View>
    </Modal>
  );
}
