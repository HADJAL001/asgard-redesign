import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { cn } from '@/lib/utils';

type InputProps = TextInputProps & {
  label?: string;
  error?: string | null;
  containerClassName?: string;
};

export const Input = forwardRef<TextInput, InputProps>(
  ({ label, error, containerClassName, className, ...props }, ref) => {
    return (
      <View className={cn('gap-1.5', containerClassName)}>
        {label ? <Text className="text-sm font-medium text-muted">{label}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor="#8A8A9A"
          className={cn(
            'rounded-xl border bg-card px-4 py-3 text-white',
            error ? 'border-down' : 'border-border',
            className,
          )}
          {...props}
        />
        {error ? <Text className="text-sm text-down">{error}</Text> : null}
      </View>
    );
  },
);

Input.displayName = 'Input';
