import { Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';

import { colors } from '@/design-system/colors';

export type StatItem = {
  icon: LucideIcon;
  value: string;
  label: string;
  color?: string;
};

type StatsGridProps = {
  stats: StatItem[];
};

/** Сетка из статистических блоков профиля: иконка сверху, крупное число, подпись. */
export function StatsGrid({ stats }: StatsGridProps) {
  return (
    <View className="flex-row gap-2">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        const color = stat.color ?? colors.cyan;
        return (
          <View
            key={i}
            className="flex-1 items-center gap-1 rounded-2xl border border-border bg-card px-2 py-4"
          >
            <Icon size={20} color={color} strokeWidth={1.75} />
            <Text className="text-lg font-bold text-white">{stat.value}</Text>
            <Text className="text-center text-xs text-muted" numberOfLines={1}>
              {stat.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
