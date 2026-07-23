import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Mic } from 'lucide-react-native';

type Props = {
  isListening: boolean;
  onPress: () => void;
  error?: string | null;
};

function useWaveStyle(isListening: boolean, delay: number) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (isListening) {
      scale.value = withTiming(1, { duration: 0 });
      opacity.value = withTiming(0.5, { duration: 0 });
      scale.value = withRepeat(withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }), -1, false);
      opacity.value = withRepeat(withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }), -1, false);
    } else {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = 1;
      opacity.value = 0;
    }
  }, [isListening, delay]);

  return useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));
}

export function VoiceInputButton({ isListening, onPress, error }: Props) {
  const wave1 = useWaveStyle(isListening, 0);
  const wave2 = useWaveStyle(isListening, 300);

  return (
    <View className="items-center">
      <View className="h-14 w-14 items-center justify-center">
        <Animated.View style={wave1} className="absolute h-14 w-14 rounded-full border-2 border-accent" />
        <Animated.View style={wave2} className="absolute h-14 w-14 rounded-full border-2 border-accent" />
        <Pressable
          onPress={onPress}
          className={`h-12 w-12 items-center justify-center rounded-full border ${
            isListening ? 'border-accent bg-accent/20' : 'border-border bg-card'
          }`}
        >
          <Mic size={20} color={isListening ? '#00D4FF' : '#8A8A9A'} />
        </Pressable>
      </View>
      {error ? <Text className="mt-1 text-xs text-down">{error}</Text> : null}
    </View>
  );
}
