import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { rarityMeta } from '@/lib/economy';
import { colors } from '@/design-system/colors';
import { InfinityForgeSymbol } from '@/components/InfinityForgeSymbol';
import { ForgeParticle } from '@/components/ForgeParticle';
import { usePrefsStore } from '@/store/prefsStore';

export type ForgePhase = 'idle' | 'charging' | 'burst' | 'reveal';

export const RARE_REVEAL_RARITIES = new Set(['epic', 'legendary', 'mythic']);

const PHASE_LABEL: Record<Exclude<ForgePhase, 'idle'>, string> = {
  charging: 'Заряжаем ядро…',
  burst: 'Синтезируем артефакт…',
  reveal: 'Готово!',
};

const PARTICLE_COUNT = 12;
const MOTE_COUNT = 6;

/** Два встречно вращающихся пунктирных кольца вокруг символа — имитация лучей веб-версии средствами SVG. */
function ChargingRings({ color }: { color: string }) {
  const rotateA = useSharedValue(0);
  const rotateB = useSharedValue(0);

  useEffect(() => {
    rotateA.value = withRepeat(withTiming(360, { duration: 4000, easing: Easing.linear }), -1, false);
    rotateB.value = withRepeat(withTiming(-360, { duration: 6000, easing: Easing.linear }), -1, false);
    return () => {
      cancelAnimation(rotateA);
      cancelAnimation(rotateB);
    };
  }, [rotateA, rotateB]);

  const styleA = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotateA.value}deg` }] }));
  const styleB = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotateB.value}deg` }] }));

  return (
    <>
      <Animated.View pointerEvents="none" style={[styleA, styles.ringOuter]}>
        <Svg width={150} height={150} viewBox="0 0 150 150">
          <Circle cx={75} cy={75} r={68} stroke={color} strokeWidth={1.5} strokeDasharray="14 12" fill="none" opacity={0.32} />
        </Svg>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styleB, styles.ringInner]}>
        <Svg width={112} height={112} viewBox="0 0 112 112">
          <Circle cx={56} cy={56} r={50} stroke={color} strokeWidth={1.5} strokeDasharray="9 15" fill="none" opacity={0.42} />
        </Svg>
      </Animated.View>
    </>
  );
}

/** Оседающая искра reveal-фазы — только для редких исходов, см. isRareReveal. */
function ForgeMote({ index, color }: { index: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(index * 90, withTiming(1, { duration: 500, easing: Easing.out(Easing.ease) }));
  }, [index, progress]);

  const driftX = index % 2 === 0 ? 10 : -10;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -30 * progress.value }, { translateX: driftX * progress.value }],
    opacity: 0.8 * (1 - progress.value),
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, { position: 'absolute', width: 3, height: 3, borderRadius: 1.5, backgroundColor: color, top: '35%', left: `${20 + index * 12}%` }]}
    />
  );
}

export function GenerationProgress({ phase, rarity }: { phase: ForgePhase; rarity?: string }) {
  const reducedMotion = usePrefsStore((s) => s.effectiveReduceMotion);
  const shakeX = useSharedValue(0);
  const shakeY = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const shockScale = useSharedValue(1);
  const shockOpacity = useSharedValue(0);
  const shock2Scale = useSharedValue(1);
  const shock2Opacity = useSharedValue(0);

  const isRareReveal = phase === 'reveal' && !!rarity && RARE_REVEAL_RARITIES.has(rarity);
  // Начиная с burst редкость уже известна (см. app/(tabs)/index.tsx) — вспышка/удар/частицы
  // окрашиваются ФАКТИЧЕСКОЙ редкостью сразу, как на вебе, а не только на reveal.
  const hasRarityColor = (phase === 'burst' || phase === 'reveal') && !!rarity;
  const accentColor = hasRarityColor ? rarityMeta(rarity!).color : colors.cyan;

  useEffect(() => {
    if (phase === 'idle' || reducedMotion) {
      [shakeX, shakeY, flashOpacity, shockScale, shockOpacity, shock2Scale, shock2Opacity].forEach(cancelAnimation);
      shakeX.value = 0;
      shakeY.value = 0;
      flashOpacity.value = 0;
      shockOpacity.value = 0;
      shock2Opacity.value = 0;
      return;
    }
    if (phase === 'burst') {
      shakeX.value = withSequence(
        withTiming(-6, { duration: 40 }),
        withTiming(5, { duration: 45 }),
        withTiming(-4, { duration: 45 }),
        withTiming(3, { duration: 50 }),
        withTiming(-2, { duration: 55 }),
        withTiming(0, { duration: 60 }),
      );
      shakeY.value = withSequence(
        withTiming(4, { duration: 40 }),
        withTiming(-3, { duration: 45 }),
        withTiming(3, { duration: 45 }),
        withTiming(-2, { duration: 50 }),
        withTiming(1, { duration: 55 }),
        withTiming(0, { duration: 60 }),
      );

      flashOpacity.value = 0.35;
      flashOpacity.value = withTiming(0, { duration: 500, easing: Easing.out(Easing.ease) });

      shockScale.value = 1;
      shockOpacity.value = 0.9;
      shockScale.value = withTiming(2, { duration: 600, easing: Easing.out(Easing.ease) });
      shockOpacity.value = withTiming(0, { duration: 600 });

      shock2Scale.value = 1;
      shock2Opacity.value = 0.6;
      shock2Scale.value = withDelay(120, withTiming(1.7, { duration: 600, easing: Easing.out(Easing.ease) }));
      shock2Opacity.value = withDelay(120, withTiming(0, { duration: 600 }));
    }
  }, [
    flashOpacity,
    phase,
    reducedMotion,
    shakeX,
    shakeY,
    shock2Opacity,
    shock2Scale,
    shockOpacity,
    shockScale,
  ]);

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }, { translateY: shakeY.value }],
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: reducedMotion ? 0 : flashOpacity.value, backgroundColor: accentColor }));
  const shockStyle = useAnimatedStyle(() => ({
    transform: [{ scale: shockScale.value }],
    opacity: reducedMotion ? 0 : shockOpacity.value,
    borderColor: accentColor,
  }));
  const shock2Style = useAnimatedStyle(() => ({
    transform: [{ scale: shock2Scale.value }],
    opacity: reducedMotion ? 0 : shock2Opacity.value,
    borderColor: '#FFFFFF',
  }));

  if (phase === 'idle') return null;

  const isBurst = phase === 'burst';

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 items-center justify-center bg-bg/90 px-8" accessibilityViewIsModal>
        {!reducedMotion ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, flashStyle]} /> : null}
        <Animated.View style={isBurst ? shakeStyle : undefined} className="items-center">
          <View className="h-28 w-40 items-center justify-center">
            {phase === 'charging' && !reducedMotion ? <ChargingRings color={accentColor} /> : null}
            {isBurst ? (
              <>
                <Animated.View pointerEvents="none" style={[shockStyle, styles.shockRing]} />
                <Animated.View pointerEvents="none" style={[shock2Style, styles.shockRing]} />
                {!reducedMotion &&
                  Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
                    <ForgeParticle
                      key={i}
                      angle={i * (360 / PARTICLE_COUNT)}
                      color={accentColor}
                      delayMs={(i % 3) * 15}
                      active={isBurst}
                      reducedMotion={reducedMotion}
                    />
                  ))}
              </>
            ) : null}
            <InfinityForgeSymbol phase={phase} color={accentColor} reducedMotion={reducedMotion} />
            {isRareReveal && !reducedMotion
              ? Array.from({ length: MOTE_COUNT }).map((_, i) => <ForgeMote key={i} index={i} color={accentColor} />)
              : null}
          </View>
          <Text
            className="mt-6 text-center text-base font-semibold"
            style={{ color: isRareReveal ? accentColor : '#FFFFFF' }}
            accessibilityLiveRegion="polite"
            accessibilityRole="text"
          >
            {isRareReveal ? `${rarityMeta(rarity!).label} артефакт!` : PHASE_LABEL[phase]}
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ringOuter: { position: 'absolute', width: 150, height: 150 },
  ringInner: { position: 'absolute', width: 112, height: 112 },
  shockRing: { position: 'absolute', width: 112, height: 112, borderRadius: 56, borderWidth: 2 },
});
