import { useState } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { LucideIcon } from 'lucide-react-native';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
};

/**
 * Единый пустой экран: иконка в свечении, заголовок, описание и опциональная
 * градиентная CTA-кнопка. Используется на экранах Истории/Профиля/Кошелька.
 */
export function EmptyState({ icon: Icon, title, description, actionLabel, onAction, style }: EmptyStateProps) {
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View className="items-center justify-center gap-3 px-6 py-10" style={style}>
      <LinearGradient
        colors={['#00D4FF33', '#0A112800']}
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={64} color="#00D4FF" strokeWidth={1.5} />
      </LinearGradient>

      <Text className="text-center text-base font-bold text-white">{title}</Text>
      {description ? (
        <Text className="max-w-[280px] text-center text-sm text-muted">{description}</Text>
      ) : null}

      {actionLabel && onAction ? (
        <AnimatedPressable
          style={[{ marginTop: 8, borderRadius: 16, overflow: 'hidden' }, animatedStyle]}
          onPressIn={() => {
            setPressed(true);
            scale.value = withTiming(0.95, { duration: 100 });
          }}
          onPressOut={() => {
            setPressed(false);
            scale.value = withTiming(1, { duration: 100 });
          }}
          onPress={onAction}
        >
          <LinearGradient
            colors={['#00D4FF', '#D4AF37']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ paddingHorizontal: 20, paddingVertical: 12, opacity: pressed ? 0.9 : 1 }}
          >
            <Text className="text-sm font-bold text-navy">{actionLabel}</Text>
          </LinearGradient>
        </AnimatedPressable>
      ) : null}
    </View>
  );
}
