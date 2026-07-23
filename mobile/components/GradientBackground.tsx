import { LinearGradient } from 'expo-linear-gradient';
import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/design-system/colors';

type GradientBackgroundProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}>;

export function GradientBackground({
  children,
  style,
  start = { x: 0, y: 0 },
  end = { x: 0, y: 1 },
}: GradientBackgroundProps) {
  return (
    <LinearGradient
      colors={[colors.navy, colors.darkCard]}
      start={start}
      end={end}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  );
}
