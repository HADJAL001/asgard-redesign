import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Mic } from 'lucide-react-native';

import type { VoiceLanguage } from '@/hooks/useVoiceInput';
import { colors } from '@/design-system/colors';

const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  'ru-RU': 'RU',
  'en-US': 'EN',
  'kk-KZ': 'KZ',
};

type Props = {
  isListening: boolean;
  onPress: () => void;
  error?: string | null;
  volume?: number;
  language?: VoiceLanguage;
  onCycleLanguage?: () => void;
};

/** delay реально применяется через withDelay — раньше параметр принимался, но не
 *  влиял на анимацию, из-за чего оба кольца пульсировали синхронно вместо
 *  расхождения по фазе (см. web components/voice-input-button.tsx, где то же
 *  расхождение задано через animation-delay 0ms/600ms). */
function useWaveStyle(isListening: boolean, delay: number) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.5);

  useEffect(() => {
    if (isListening) {
      scale.value = 1;
      opacity.value = 0.5;
      scale.value = withDelay(delay, withRepeat(withTiming(1.8, { duration: 1200, easing: Easing.out(Easing.ease) }), -1, false));
      opacity.value = withDelay(delay, withRepeat(withTiming(0, { duration: 1200, easing: Easing.out(Easing.ease) }), -1, false));
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

/** Полоска уровня громкости: высота/прозрачность реагируют на реальный уровень
 *  сигнала с микрофона (см. useVoiceInput -> событие volumechange). */
function LevelBar({ volume, isListening, multiplier }: { volume: number; isListening: boolean; multiplier: number }) {
  const level = useSharedValue(0);

  useEffect(() => {
    level.value = withTiming(isListening ? Math.min(1, volume * multiplier) : 0, { duration: 120 });
  }, [volume, isListening, multiplier]);

  const style = useAnimatedStyle(() => ({
    height: 4 + level.value * 16,
    opacity: 0.4 + level.value * 0.6,
  }));

  return <Animated.View style={style} className="w-1 rounded-full bg-accent" />;
}

export function VoiceInputButton({ isListening, onPress, error, volume = 0, language, onCycleLanguage }: Props) {
  const wave1 = useWaveStyle(isListening, 0);
  const wave2 = useWaveStyle(isListening, 600);
  const barMultipliers = [0.8, 1.3, 1, 1.5, 0.9];

  return (
    <View className="items-center gap-1">
      {language && onCycleLanguage ? (
        <Pressable
          onPress={onCycleLanguage}
          disabled={isListening}
          className="rounded-full border border-border bg-card px-2 py-0.5"
        >
          <Text className="text-[10px] font-semibold text-muted">{LANGUAGE_LABELS[language]}</Text>
        </Pressable>
      ) : null}

      <View className="h-14 w-14 items-center justify-center">
        <Animated.View style={wave1} className="absolute h-14 w-14 rounded-full border-2 border-accent" />
        <Animated.View style={wave2} className="absolute h-14 w-14 rounded-full border-2 border-accent" />
        <Pressable
          onPress={onPress}
          className={`h-12 w-12 items-center justify-center rounded-full border ${
            isListening ? 'border-accent bg-accent/20' : 'border-border bg-card'
          }`}
        >
          <Mic size={20} color={isListening ? colors.cyan : '#8A8A9A'} />
        </Pressable>
      </View>

      {isListening ? (
        <View className="h-5 flex-row items-end gap-0.5">
          {barMultipliers.map((multiplier, index) => (
            <LevelBar key={index} volume={volume} isListening={isListening} multiplier={multiplier} />
          ))}
        </View>
      ) : null}

      {error ? <Text className="mt-1 max-w-[160px] text-center text-xs text-down">{error}</Text> : null}
    </View>
  );
}
