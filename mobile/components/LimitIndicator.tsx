import { useEffect } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Zap } from 'lucide-react-native';

import { colors } from '@/design-system/colors';
import { useStatusCopy } from '@/lib/i18n/useStatusCopy';

type LimitIndicatorProps = {
  /** How many actions the user has already spent today — real usage count, not fabricated. */
  used: number;
  /** Daily allotment from the backend/soft-limit constant — never hardcode this at the call site. */
  max: number;
};

/** Renders remaining daily "creation charge" as a segmented bar instead of a bare N/M fraction. */
export function LimitIndicator({ used, max }: LimitIndicatorProps) {
  const copy = useStatusCopy();
  const remaining = Math.max(0, max - used);
  const ratio = max > 0 ? Math.min(1, remaining / max) : 0;
  const depleted = remaining === 0;

  const progress = useSharedValue(ratio);
  useEffect(() => {
    progress.value = withTiming(ratio, { duration: 400 });
  }, [ratio, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <Zap size={14} color={depleted ? colors.textSecondary : colors.gold} />
        <Text className={depleted ? 'text-muted' : 'text-white'}>
          {depleted ? copy.limitDepleted : copy.limitRemaining(remaining)}
        </Text>
      </View>
      <View className="h-1.5 flex-row gap-1">
        {Array.from({ length: max }).map((_, i) => (
          <View key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            {i < remaining ? (
              <Animated.View
                style={[{ height: '100%', backgroundColor: colors.gold }, i === remaining - 1 ? fillStyle : null]}
              />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}
