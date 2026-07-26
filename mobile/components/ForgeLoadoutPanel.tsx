import { Pressable, Text, View } from 'react-native';
import { Hammer, Sparkles, Swords, X } from 'lucide-react-native';

import { rarityMeta, typeMeta } from '@/lib/economy';
import { colors } from '@/design-system/colors';
import type { ForgeLoadout } from '@/types/artifact';

type ForgeLoadoutPanelProps = {
  loadout: ForgeLoadout;
  onUnequip: (id: number) => void;
};

/**
 * Панель "Снаряжение Кузницы" — порт components/artifacts-view.tsx (веб) ForgeLoadoutPanel.
 * Золотой акцент отличает её от кибер-акцента остальной мобилки: бонус честный и
 * платформонезависимый (см. backend/src/lib/forge-loadout.ts) — применяется к статам/шансу
 * редкости следующего рождённого артефакта, а не к текущей AI-генерации.
 */
export function ForgeLoadoutPanel({ loadout, onUnequip }: ForgeLoadoutPanelProps) {
  const { equipped, bonus, maxSlots } = loadout;
  const slots = Array.from({ length: maxSlots }, (_, i) => equipped[i] ?? null);
  const hasBonus = bonus.statBonus > 0 || bonus.rarityUpChance > 0;
  const rarityPct = Math.round(bonus.rarityUpChance * 100);

  return (
    <View
      className="mx-4 mb-3 rounded-2xl p-4"
      style={{ borderWidth: 1, borderColor: `${colors.gold}33`, backgroundColor: `${colors.gold}0F` }}
    >
      <View className="flex-row items-center gap-2.5">
        <View
          className="items-center justify-center rounded-xl"
          style={{ width: 36, height: 36, borderWidth: 1, borderColor: `${colors.gold}55` }}
        >
          <Hammer size={18} color={colors.gold} strokeWidth={1.75} />
        </View>
        <View className="flex-1">
          <Text style={{ color: colors.gold }} className="text-[15px] font-semibold">
            Снаряжение Кузницы
          </Text>
          <Text className="text-[11px] text-muted">
            Надето {equipped.length} из {maxSlots} · усиливают артефакты со следующим проектом
          </Text>
        </View>
      </View>

      <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
        {hasBonus ? (
          <>
            <View
              className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ borderWidth: 1, borderColor: `${colors.gold}55` }}
            >
              <Swords size={12} color={colors.gold} strokeWidth={1.75} />
              <Text style={{ color: colors.gold }} className="text-[11px] font-medium">
                +{bonus.statBonus} к статам
              </Text>
            </View>
            {rarityPct > 0 && (
              <View
                className="flex-row items-center gap-1.5 rounded-full px-3 py-1.5"
                style={{ borderWidth: 1, borderColor: `${colors.gold}55` }}
              >
                <Sparkles size={12} color={colors.gold} strokeWidth={1.75} />
                <Text style={{ color: colors.gold }} className="text-[11px] font-medium">
                  {rarityPct}% шанс редкости
                </Text>
              </View>
            )}
          </>
        ) : (
          <Text className="text-[11px] text-muted">Наденьте артефакты, чтобы усилить генерацию</Text>
        )}
      </View>

      <View className="mt-3 gap-2">
        {slots.map((slot, i) => {
          if (!slot) {
            return (
              <View
                key={`empty-${i}`}
                className="items-center justify-center rounded-xl py-3"
                style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#22222E' }}
              >
                <Text className="text-[11px] text-muted">Пустой слот</Text>
              </View>
            );
          }
          const rarity = rarityMeta(slot.rarity);
          const TypeIcon = typeMeta(slot.type).Icon;
          return (
            <View
              key={slot.id}
              className="flex-row items-center justify-between rounded-xl bg-card px-3 py-2.5"
              style={{ borderWidth: 1, borderColor: `${rarity.color}66` }}
            >
              <View className="flex-1 flex-row items-center gap-2.5">
                <View
                  className="items-center justify-center rounded-lg"
                  style={{ width: 36, height: 36, borderWidth: 1, borderColor: rarity.color }}
                >
                  <TypeIcon size={18} color={rarity.color} strokeWidth={1.25} />
                </View>
                <View className="flex-1">
                  <Text className="text-[13px] font-medium text-white" numberOfLines={1}>
                    {slot.name}
                  </Text>
                  <Text style={{ color: rarity.color }} className="text-[11px]">
                    {rarity.label} · Ур. {slot.level}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => onUnequip(slot.id)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Снять ${slot.name} со снаряжения`}
                className="items-center justify-center rounded-lg"
                style={{ width: 28, height: 28, borderWidth: 1, borderColor: '#22222E' }}
              >
                <X size={14} color={colors.textSecondary} strokeWidth={2} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
