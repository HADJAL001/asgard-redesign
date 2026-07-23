import { View, type ViewProps } from 'react-native';
import { cn } from '@/lib/utils';

type CardProps = ViewProps & {
  /** Overrides the default border color (e.g. rarity color), keeps border width at 2. */
  accentColor?: string;
};

export function Card({ accentColor, style, className, children, ...props }: CardProps) {
  return (
    <View
      className={cn('rounded-2xl border border-border bg-card p-4', className)}
      style={[accentColor ? { borderWidth: 2, borderColor: accentColor } : null, style]}
      {...props}
    >
      {children}
    </View>
  );
}
