import { useEffect } from 'react';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Лемниската из двух окружностей, встречающихся в центре — при обводке читается как ∞.
const INFINITY_PATH =
  'M100,50 C100,77.6 77.6,100 50,100 C22.4,100 0,77.6 0,50 C0,22.4 22.4,0 50,0 C77.6,0 100,22.4 100,50 ' +
  'C100,77.6 122.4,100 150,100 C177.6,100 200,77.6 200,50 C200,22.4 177.6,0 150,0 C122.4,0 100,22.4 100,50 Z';
const PATH_LENGTH = 640;

type Props = {
  phase: 'charging' | 'burst' | 'reveal';
  color: string;
  reducedMotion: boolean;
};

export function InfinityForgeSymbol({ phase, color, reducedMotion }: Props) {
  const dashOffset = useSharedValue(PATH_LENGTH);
  const strokeWidth = useSharedValue(4);

  useEffect(() => {
    if (reducedMotion) {
      dashOffset.value = 0;
      strokeWidth.value = phase === 'burst' ? 7 : 4;
      return;
    }
    if (phase === 'charging') {
      // Бесконечный бегущий контур — символ "дышит" сколько угодно долго, пока не придёт ответ backend.
      dashOffset.value = withRepeat(withTiming(0, { duration: 1400, easing: Easing.linear }), -1, false);
      strokeWidth.value = withTiming(4, { duration: 200 });
    } else if (phase === 'burst') {
      dashOffset.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.exp) });
      strokeWidth.value = withTiming(8, { duration: 250, easing: Easing.out(Easing.exp) });
    } else if (phase === 'reveal') {
      dashOffset.value = withTiming(0, { duration: 250 });
      strokeWidth.value = withTiming(5, { duration: 250 });
    }
  }, [phase, reducedMotion]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: dashOffset.value,
    strokeWidth: strokeWidth.value,
  }));

  return (
    <Svg width={140} height={70} viewBox="0 0 200 100">
      <AnimatedPath
        d={INFINITY_PATH}
        stroke={color}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={PATH_LENGTH}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}
