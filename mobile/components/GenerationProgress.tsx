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

export type ForgePhase = 'idle' | 'charging' | 'burst' | 'reveal';

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

export function GenerationProgress({ phase }: { phase: ForgePhase }) {
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (phase === 'idle' || reducedMotion) {
      cancelAnimation(scale);
      cancelAnimation(ringOpacity);
      return;
    }
    if (phase === 'charging') {
      scale.value = withRepeat(withTiming(1.15, { duration: 500, easing: Easing.inOut(Easing.ease) }), -1, true);
      ringOpacity.value = withRepeat(withTiming(0.9, { duration: 500 }), -1, true);
    } else if (phase === 'burst') {
      scale.value = withSequence(withTiming(1.6, { duration: 350, easing: Easing.out(Easing.exp) }), withTiming(1.3, { duration: 150 }));
      ringOpacity.value = withTiming(1, { duration: 200 });
    } else if (phase === 'reveal') {
      scale.value = withTiming(1, { duration: 250 });
      ringOpacity.value = withTiming(0.6, { duration: 250 });
    }
  }, [phase, reducedMotion]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: reducedMotion ? 1 : scale.value }],
    opacity: reducedMotion ? 0.7 : ringOpacity.value,
  }));

  if (phase === 'idle') return null;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-bg/90 px-8">
        <Animated.View
          style={ringStyle}
          className="h-28 w-28 items-center justify-center rounded-full border-2 border-accent"
        >
          {phase === 'reveal' ? (
            <Check size={40} color="#00D4FF" />
          ) : (
            <Sparkles size={40} color="#00D4FF" />
          )}
        </Animated.View>
        <Text className="mt-6 text-center text-base font-semibold text-white">
          {PHASE_LABEL[phase]}
        </Text>
      </View>
    </Modal>
  );
}
