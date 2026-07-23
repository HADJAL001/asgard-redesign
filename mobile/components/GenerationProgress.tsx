import { useEffect, useState } from 'react';
import { AccessibilityInfo, Modal, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Sparkles, Check } from 'lucide-react-native';
import { rarityMeta } from '@/lib/economy';
import { colors } from '@/design-system/colors';

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
  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.4);
  const shockScale = useSharedValue(1);
  const shockOpacity = useSharedValue(0);

  const isRareReveal = phase === 'reveal' && !!rarity && RARE_REVEAL_RARITIES.has(rarity);
  const accentColor = isRareReveal ? rarityMeta(rarity!).color : colors.cyan;

  useEffect(() => {
    if (phase === 'idle' || reducedMotion) {
      cancelAnimation(scale);
      cancelAnimation(ringOpacity);
      cancelAnimation(shockScale);
      cancelAnimation(shockOpacity);
      return;
    }
    if (phase === 'charging') {
      scale.value = withRepeat(withTiming(1.15, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true);
      ringOpacity.value = withRepeat(withTiming(0.9, { duration: 500 }), -1, true);
    } else if (phase === 'burst') {
      scale.value = withSequence(withTiming(1.6, { duration: 350, easing: Easing.out(Easing.exp) }), withTiming(1.3, { duration: 150 }));
      ringOpacity.value = withTiming(1, { duration: 200 });
    } else if (phase === 'reveal') {
      scale.value = withTiming(isRareReveal ? 1.1 : 1, { duration: 250 });
      ringOpacity.value = withTiming(0.6, { duration: 250 });
      if (isRareReveal) {
        shockScale.value = 1;
        shockOpacity.value = 0.8;
        shockScale.value = withTiming(2.2, { duration: 650, easing: Easing.out(Easing.ease) });
        shockOpacity.value = withTiming(0, { duration: 650 });
      }
    }
  }, [phase, reducedMotion, isRareReveal]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : scale.value }],
    opacity: reducedMotion ? 0.7 : ringOpacity.value,
    borderColor: accentColor,
  }));

  const shockStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shockScale.value }],
    opacity: reducedMotion ? 0 : shockOpacity.value,
    borderColor: accentColor,
  }));

  if (phase === 'idle') return null;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-bg/90 px-8">
        <View className="h-28 w-28 items-center justify-center">
          {isRareReveal ? (
            <Animated.View
              pointerEvents="none"
              style={[shockStyle, { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 2 }]}
            />
          ) : null}
          <Animated.View
            style={ringStyle}
            className="h-28 w-28 items-center justify-center rounded-full border-2"
          >
            {phase === 'reveal' ? (
              <Check size={40} color={accentColor} />
            ) : (
              <Sparkles size={40} color={colors.cyan} />
            )}
          </Animated.View>
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
