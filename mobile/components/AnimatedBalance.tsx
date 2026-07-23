import { useEffect } from 'react';
import { TextInput, type TextStyle } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

type AnimatedBalanceProps = {
  value: number;
  format: (n: number) => string;
  style?: TextStyle;
  className?: string;
};

/** Плавно анимирует переход между числовыми значениями баланса (не просто дёргается на новое число). */
export function AnimatedBalance({ value, format, style, className }: AnimatedBalanceProps) {
  const animated = useSharedValue(value);

  useEffect(() => {
    animated.value = withTiming(value, { duration: 400 });
  }, [value]);

  const animatedProps = useAnimatedProps(() => ({
    text: format(animated.value),
  }));

  return (
    <AnimatedTextInput
      editable={false}
      underlineColorAndroid="transparent"
      className={className}
      style={style}
      defaultValue={format(value)}
      // `text` is a reanimated-only escape hatch for native TextInput content and isn't in TextInputProps' types.
      animatedProps={animatedProps as any}
    />
  );
}
