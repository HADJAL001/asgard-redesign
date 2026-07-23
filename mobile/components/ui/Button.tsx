import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = Omit<PressableProps, 'children'> & {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
};

const VARIANT_CONTAINER: Record<ButtonVariant, string> = {
  primary: 'bg-accent',
  secondary: 'border border-border bg-card',
  danger: 'bg-down',
  ghost: 'bg-transparent',
};

const VARIANT_TEXT: Record<ButtonVariant, string> = {
  primary: 'text-bg',
  secondary: 'text-white',
  danger: 'text-white',
  ghost: 'text-accent',
};

const SIZE_CONTAINER: Record<ButtonSize, string> = {
  sm: 'px-3 py-2',
  md: 'px-4 py-3',
  lg: 'px-4 py-4',
};

const SIZE_TEXT: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-base',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  ...props
}: ButtonProps & { className?: string }) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      disabled={isDisabled}
      className={cn(
        'flex-row items-center justify-center gap-2 rounded-xl',
        SIZE_CONTAINER[size],
        VARIANT_CONTAINER[variant],
        isDisabled && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#0A0A0F' : '#00D4FF'} size="small" />
      ) : null}
      <Text className={cn('font-bold', SIZE_TEXT[size], VARIANT_TEXT[variant])}>{children}</Text>
    </Pressable>
  );
}
