import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { colors } from '@/design-system/colors';

type IconProps = {
  name: ComponentProps<typeof Ionicons>['name'];
  size?: number;
  color?: string;
};

export function Icon({ name, size = 24, color = colors.text }: IconProps) {
  return <Ionicons name={name} size={size} color={color} />;
}
