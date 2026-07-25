/**
 * Артефакт-Фьюжн — чистая логика скрещивания (без БД/сети, юнит-тестируемо).
 * Два родителя → статы потомка (среднее, при мутации — усиленное) и редкость
 * (выше из родителей, при мутации — на ступень вверх). Мутацию решает вызывающий
 * (роут: Math.random() < MUTATION_CHANCE), сюда передаётся булевым — это делает
 * функции детерминированными и легко тестируемыми.
 */

export const FUSION_RARITY_ORDER = ["common", "rare", "epic", "legendary", "mythic"] as const;
export type FusionRarity = (typeof FUSION_RARITY_ORDER)[number];

export const MUTATION_CHANCE = 0.15;
const MUTATION_MULT = 1.3;
const STAT_MIN = 10;
const STAT_MAX = 99;

export interface FusionStats {
  power: number;
  defense: number;
  magic: number;
  speed: number;
}

function clampStat(n: number): number {
  return Math.min(STAT_MAX, Math.max(STAT_MIN, Math.round(n)));
}

/** Статы потомка: среднее родителей; при мутации усилены на MUTATION_MULT. */
export function fuseStats(a: FusionStats, b: FusionStats, mutate: boolean): FusionStats {
  const blend = (x: number, y: number) => clampStat(((x + y) / 2) * (mutate ? MUTATION_MULT : 1));
  return {
    power: blend(a.power, b.power),
    defense: blend(a.defense, b.defense),
    magic: blend(a.magic, b.magic),
    speed: blend(a.speed, b.speed),
  };
}

function rarityIndex(r: string): number {
  const i = (FUSION_RARITY_ORDER as readonly string[]).indexOf(r);
  return i < 0 ? 0 : i; // неизвестную редкость трактуем как common
}

/** Редкость потомка: выше из двух родителей; при мутации — на ступень вверх (до mythic). */
export function fusedRarity(a: string, b: string, mutate: boolean): FusionRarity {
  const base = Math.max(rarityIndex(a), rarityIndex(b));
  const idx = mutate ? Math.min(base + 1, FUSION_RARITY_ORDER.length - 1) : base;
  return FUSION_RARITY_ORDER[idx];
}

/** Хинт для AI-генерации имени/лора потомка — из имён и типов родителей. */
export function fusionHint(a: { name: string; type: string }, b: { name: string; type: string }): string {
  return `Слияние двух артефактов: «${a.name}» (${a.type}) и «${b.name}» (${b.type}). ` +
    `Придумай потомка, наследующего мотивы обоих.`;
}
