import { Text, View } from 'react-native';
import { rarityMeta } from '@/lib/economy';
import { useStatusCopy } from '@/lib/i18n/useStatusCopy';

type ArtifactRarityProps = {
  rarity: string;
  /** Total minted supply for this artifact — real backend figure, never fabricated. */
  supply: number;
  /** This artifact's position in the mint order, if the backend tracks one (1-indexed). */
  rank?: number;
};

/** Auction-house-style rarity readout: badge + edition framing, built on the existing rarityMeta palette. */
export function ArtifactRarity({ rarity, supply, rank }: ArtifactRarityProps) {
  const meta = rarityMeta(rarity);
  const copy = useStatusCopy();

  const editionLabel =
    supply <= 1 ? copy.rarityUnique : rank != null ? copy.rarityEdition(rank, supply) : copy.rarityOneOfOne;

  return (
    <View className="flex-row items-center gap-2">
      <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: `${meta.color}22` }}>
        <Text style={{ color: meta.color }} className="text-xs font-semibold">
          {meta.symbol} {meta.label}
        </Text>
      </View>
      <Text className="text-xs text-muted">{editionLabel}</Text>
    </View>
  );
}
