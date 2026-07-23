import { ScrollView, Pressable, Text, View } from 'react-native';
import { RARITY, ARTIFACT_TYPES, type ArtifactType } from '@/lib/economy';
import type { ArtifactRarity } from '@/types/artifact';

export type DateRange = 'all' | 'today' | 'week' | 'month';

const DATE_RANGES: { key: DateRange; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
];

export type HistoryFiltersValue = {
  dateRange: DateRange;
  type: ArtifactType | null;
  rarity: ArtifactRarity | null;
};

function Chip({ selected, label, color, onPress }: { selected: boolean; label: string; color?: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-3 py-1.5 ${selected ? 'border-accent bg-accent/10' : 'border-border bg-card'}`}
    >
      <Text style={selected && color ? { color } : undefined} className={selected ? 'text-accent text-xs font-semibold' : 'text-muted text-xs font-medium'}>
        {label}
      </Text>
    </Pressable>
  );
}

export function HistoryFilters({
  value,
  onChange,
}: {
  value: HistoryFiltersValue;
  onChange: (value: HistoryFiltersValue) => void;
}) {
  return (
    <View className="gap-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {DATE_RANGES.map((r) => (
          <Chip
            key={r.key}
            label={r.label}
            selected={value.dateRange === r.key}
            onPress={() => onChange({ ...value, dateRange: r.key })}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Все типы" selected={value.type === null} onPress={() => onChange({ ...value, type: null })} />
        {(Object.keys(ARTIFACT_TYPES) as ArtifactType[]).map((t) => (
          <Chip
            key={t}
            label={ARTIFACT_TYPES[t].label}
            selected={value.type === t}
            onPress={() => onChange({ ...value, type: value.type === t ? null : t })}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Любая редкость" selected={value.rarity === null} onPress={() => onChange({ ...value, rarity: null })} />
        {(Object.keys(RARITY) as ArtifactRarity[]).map((r) => (
          <Chip
            key={r}
            label={RARITY[r].label}
            color={RARITY[r].color}
            selected={value.rarity === r}
            onPress={() => onChange({ ...value, rarity: value.rarity === r ? null : r })}
          />
        ))}
      </ScrollView>
    </View>
  );
}
