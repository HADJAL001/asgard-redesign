import { useCallback, useEffect, useState } from 'react';
import { Text, type TextStyle } from 'react-native';
import { runOnJS, useAnimatedReaction, useSharedValue, withTiming } from 'react-native-reanimated';

type AnimatedBalanceProps = {
  value: number;
  format: (n: number) => string;
  style?: TextStyle;
  className?: string;
};

/**
 * Плавно анимирует переход между числовыми значениями баланса (не просто дёргается на новое число).
 * `format` — обычная JS-функция (может использовать toLocaleString и т.п.), поэтому её нельзя
 * вызывать внутри reanimated-ворклета на UI-потоке — форматирование делаем на JS-потоке через runOnJS.
 */
export function AnimatedBalance({ value, format, style, className }: AnimatedBalanceProps) {
  const animated = useSharedValue(value);
  const [text, setText] = useState(() => format(value));

  useEffect(() => {
    animated.value = withTiming(value, { duration: 400 });
  }, [value]);

  const updateText = useCallback((n: number) => setText(format(n)), [format]);

  useAnimatedReaction(
    () => animated.value,
    (current) => {
      runOnJS(updateText)(current);
    },
  );

  return (
    <Text className={className} style={style}>
      {text}
    </Text>
  );
}
