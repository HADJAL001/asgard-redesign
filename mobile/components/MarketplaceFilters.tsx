import { ScrollView, Pressable, Text, View } from 'react-native';
import { RARITY, ARTIFACT_TYPES, type ArtifactType } from '@/lib/economy';
import type { ArtifactRarity } from '@/types/artifact';

export type MarketplaceSort = 'price_asc' | 'price_desc';

const SORTS: { key: MarketplaceSort; label: string }[] = [
  { key: 'price_asc', label: 'Цена ↑' },
  { key: 'price_desc', label: 'Цена ↓' },
];

export type MarketplaceFiltersValue = {
  type: ArtifactType | null;
  rarity: ArtifactRarity | null;
  sort: MarketplaceSort;
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

export function MarketplaceFilters({
  value,
  onChange,
}: {
  value: MarketplaceFiltersValue;
  onChange: (value: MarketplaceFiltersValue) => void;
}) {
  return (
    <View className="gap-2">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SORTS.map((s) => (
          <Chip
            key={s.key}
            label={s.label}
            selected={value.sort === s.key}
            onPress={() => onChange({ ...value, sort: s.key })}
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
