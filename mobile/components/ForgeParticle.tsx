import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

const DISTANCE = 72;
const DURATION = 750;
const SIZE = 5;

type Props = {
  angle: number;
  color: string;
  delayMs: number;
  active: boolean;
  reducedMotion: boolean;
};

export function ForgeParticle({ angle, color, delayMs, active, reducedMotion }: Props) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reducedMotion) return;
    if (active) {
      progress.value = 0;
      progress.value = withDelay(delayMs, withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) }));
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [active, reducedMotion, delayMs]);

  const rad = (angle * Math.PI) / 180;

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(rad) * DISTANCE * progress.value },
      { translateY: Math.sin(rad) * DISTANCE * progress.value },
    ],
    opacity: 1 - progress.value,
  }));

  if (reducedMotion) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          position: 'absolute',
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          backgroundColor: color,
          top: '50%',
          left: '50%',
          marginTop: -SIZE / 2,
          marginLeft: -SIZE / 2,
        },
      ]}
    />
  );
}
