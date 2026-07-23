import { Text, View } from 'react-native';
import { rarityMeta, typeMeta, STAT_META } from '@/lib/economy';
import type { OsgardArtifact } from '@/types/artifact';

export function ResultCard({ artifact }: { artifact: OsgardArtifact }) {
  const rarity = rarityMeta(artifact.rarity);
  const type = typeMeta(artifact.type);
  const TypeIcon = type.Icon;

  return (
    <View
      className="rounded-2xl bg-card p-5"
      style={{ borderWidth: 2, borderColor: rarity.color }}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <TypeIcon size={20} color={rarity.color} />
          <Text className="text-xs font-semibold uppercase text-muted">{type.label}</Text>
        </View>
        <Text style={{ color: rarity.color }} className="text-xs font-bold uppercase">
          {rarity.symbol} {rarity.label}
        </Text>
      </View>

      <Text className="mt-3 text-xl font-bold text-white">{artifact.name}</Text>
      {artifact.description ? (
        <Text className="mt-1 text-sm text-muted">{artifact.description}</Text>
      ) : null}

      <View className="mt-4 flex-row flex-wrap gap-3">
        {STAT_META.map((stat) => {
          const Icon = stat.Icon;
          return (
            <View key={stat.key} className="min-w-[45%] flex-1 flex-row items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2">
              <Icon size={16} color="#00D4FF" />
              <Text className="text-muted">{stat.label}</Text>
              <Text className="ml-auto text-base font-bold text-white">{artifact[stat.key]}</Text>
            </View>
          );
        })}
      </View>

      {artifact.lore ? (
        <Text className="mt-4 text-sm italic text-muted">{artifact.lore}</Text>
      ) : null}
    </View>
  );
}
