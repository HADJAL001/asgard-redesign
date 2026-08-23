import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeForgeDiscount,
  computeForgeBonus,
  FORGE_DISCOUNT_CAP,
  FORGE_MAX_SLOTS,
  ZERO_FORGE_DISCOUNT,
  type EquippedArtifactStats,
} from '../lib/forge-loadout';

/* ================================================================
   OSGARD · Рычаг 2 «Живой артефакт» — скидка на ручную ковку от
   честности (craftScore) надетых артефактов. Чистая логика:
   пустой лоадаут → 0; legacy (craftScore=NULL/0) → 0; растёт с
   честностью (монотонность); ограничена сверху FORGE_DISCOUNT_CAP;
   учитывает не больше FORGE_MAX_SLOTS слотов; детерминизм.
   ================================================================ */

function mk(craftScore: number | null): EquippedArtifactStats {
  return { power: 20, defense: 20, magic: 20, speed: 20, rarity: 'rare', level: 1, craftScore };
}

test('скидка: пустой лоадаут → нулевая скидка', () => {
  assert.deepEqual(computeForgeDiscount([]), { ...ZERO_FORGE_DISCOUNT });
});

test('скидка: legacy (craftScore=null) вклада не даёт', () => {
  const d = computeForgeDiscount([mk(null), mk(null), mk(null)]);
  assert.equal(d.discountRate, 0);
  assert.equal(d.equippedCount, 3);
});

test('скидка: craftScore=0 вклада не даёт', () => {
  assert.equal(computeForgeDiscount([mk(0), mk(0)]).discountRate, 0);
});

test('скидка: растёт с честностью надетого артефакта (монотонность)', () => {
  const low = computeForgeDiscount([mk(0.2)]).discountRate;
  const mid = computeForgeDiscount([mk(0.6)]).discountRate;
  const high = computeForgeDiscount([mk(1)]).discountRate;
  assert.ok(low < mid, `${low} < ${mid}`);
  assert.ok(mid < high, `${mid} < ${high}`);
});

test('скидка: больше честных артефактов → больше скидка', () => {
  const one = computeForgeDiscount([mk(1)]).discountRate;
  const three = computeForgeDiscount([mk(1), mk(1), mk(1)]).discountRate;
  assert.ok(three > one, `${three} > ${one}`);
});

test('скидка: не превышает FORGE_DISCOUNT_CAP даже при максимуме', () => {
  const d = computeForgeDiscount([mk(1), mk(1), mk(1), mk(1), mk(1)]);
  assert.ok(d.discountRate <= FORGE_DISCOUNT_CAP, `${d.discountRate} <= ${FORGE_DISCOUNT_CAP}`);
  assert.equal(d.discountRate, FORGE_DISCOUNT_CAP);
});

test('скидка: учитывает не более FORGE_MAX_SLOTS слотов', () => {
  const many = Array.from({ length: FORGE_MAX_SLOTS + 4 }, () => mk(0.5));
  const capped = Array.from({ length: FORGE_MAX_SLOTS }, () => mk(0.5));
  assert.equal(
    computeForgeDiscount(many).discountRate,
    computeForgeDiscount(capped).discountRate,
  );
  assert.equal(computeForgeDiscount(many).equippedCount, FORGE_MAX_SLOTS);
});

test('скидка: невалидный craftScore (NaN / вне [0..1]) нормализуется', () => {
  assert.equal(computeForgeDiscount([mk(NaN)]).discountRate, 0);
  // craftScore > 1 зажимается до 1 → как честный топ-артефакт, но не больше CAP
  const over = computeForgeDiscount([mk(5), mk(5), mk(5)]);
  assert.ok(over.discountRate <= FORGE_DISCOUNT_CAP);
  assert.equal(over.discountRate, computeForgeDiscount([mk(1), mk(1), mk(1)]).discountRate);
  // craftScore < 0 → 0
  assert.equal(computeForgeDiscount([mk(-3)]).discountRate, 0);
});

test('скидка: детерминизм — тот же вход даёт тот же результат', () => {
  const eq = [mk(0.8), mk(0.4)];
  assert.deepEqual(computeForgeDiscount(eq), computeForgeDiscount(eq));
});

test('artifact ability power materially improves its forge discount', () => {
  const base = { ...mk(1), abilityKey: 'forge_insight', abilityPower: 0 };
  const empowered = { ...mk(1), abilityKey: 'forge_insight', abilityPower: 20 };
  assert.ok(computeForgeDiscount([empowered]).discountRate > computeForgeDiscount([base]).discountRate);
});

test('artifact abilities have distinct, real forge effects', () => {
  const base = { ...mk(1), power: 40, defense: 40, magic: 40, speed: 40 };
  const force = { ...base, abilityKey: 'forge_force', abilityPower: 20 };
  const guard = { ...base, abilityKey: 'forge_guard', abilityPower: 20 };
  const insight = { ...base, abilityKey: 'forge_insight', abilityPower: 20 };

  assert.ok(computeForgeBonus([force]).statBonus > computeForgeBonus([guard]).statBonus);
  assert.ok(computeForgeBonus([guard]).rarityUpChance > computeForgeBonus([force]).rarityUpChance);
  assert.ok(computeForgeDiscount([insight]).discountRate > computeForgeDiscount([force]).discountRate);
});
