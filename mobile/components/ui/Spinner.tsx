import { ActivityIndicator, View } from 'react-native';
import { cn } from '@/lib/utils';

type SpinnerProps = {
  size?: 'small' | 'large';
  color?: string;
  /** Renders the spinner centered and filling its parent — useful for full-screen loading states. */
  fullscreen?: boolean;
  className?: string;
};

export function Spinner({ size = 'small', color = '#00D4FF', fullscreen = false, className }: SpinnerProps) {
  if (!fullscreen) return <ActivityIndicator size={size} color={color} />;

  return (
    <View className={cn('flex-1 items-center justify-center bg-bg', className)}>
      <ActivityIndicator size={size === 'small' ? 'large' : size} color={color} />
    </View>
  );
}
