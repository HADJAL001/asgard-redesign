/* ================================================================
   OSGARD · LoadingAnimation — золотой вращающийся логотип + градиентный
   прогресс-бар + "Загрузка..." с бегущими точками. Используется при
   загрузке артефактов и кошелька (в отличие от GenerationProgress,
   который отвечает за модалку активной генерации артефакта).
   ================================================================ */
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Sparkles } from 'lucide-react-native';

const DOT_INTERVAL_MS = 400;

function useDots(): string {
  const [count, setCount] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setCount((c) => (c % 3) + 1), DOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
  return '.'.repeat(count);
}

export function LoadingAnimation({ label = 'Загрузка' }: { label?: string }) {
  const rotation = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const dots = useDots();

  useEffect(() => {
    rotation.value = withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1);
    shimmer.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => {
      cancelAnimation(rotation);
      cancelAnimation(shimmer);
    };
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const barStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + shimmer.value * 0.5,
    transform: [{ scaleX: 0.3 + shimmer.value * 0.7 }],
  }));

  return (
    <View className="flex-1 items-center justify-center gap-5 bg-bg py-16">
      <Animated.View style={logoStyle}>
        <Sparkles size={48} color="#D4AF37" />
      </Animated.View>

      <View className="h-1.5 w-40 overflow-hidden rounded-full bg-border">
        <Animated.View style={[{ height: '100%', width: '100%', transformOrigin: 'left' }, barStyle]}>
          <LinearGradient
            colors={['#D4AF37', '#00D4FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      </View>

      <Text className="text-sm text-muted">
        {label}
        {dots}
      </Text>
    </View>
  );
}
