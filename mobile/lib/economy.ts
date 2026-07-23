import { Brain, Gem, Swords, Shield, Sparkles, Zap, Bolt, Infinity as InfinityIcon, Award, Crown, type LucideIcon } from 'lucide-react-native';
import type { ArtifactRarity } from '@/types/artifact';

/** Зеркало rarity-палитры из веб lib/economy.tsx — для визуального паритета мобилки с вебом. */
export const RARITY: Record<ArtifactRarity, { label: string; color: string; symbol: string }> = {
  common: { label: 'Обычный', color: '#6A6A8A', symbol: '○' },
  rare: { label: 'Редкий', color: '#4A7A9C', symbol: '◇' },
  epic: { label: 'Эпический', color: '#9B59B6', symbol: '◆' },
  legendary: { label: 'Легендарный', color: '#F1C40F', symbol: '★' },
  mythic: { label: 'Мифический', color: '#E74C3C', symbol: '∞' },
};

const DEFAULT_RARITY = RARITY.common;

export function rarityMeta(rarity: string) {
  return RARITY[rarity as ArtifactRarity] ?? DEFAULT_RARITY;
}

export type ArtifactType = 'neural' | 'crystal' | 'weapon' | 'shield' | 'artifact';

export const ARTIFACT_TYPES: Record<ArtifactType, { label: string; Icon: LucideIcon }> = {
  neural: { label: 'Нейросеть', Icon: Brain },
  crystal: { label: 'Кристалл', Icon: Gem },
  weapon: { label: 'Оружие', Icon: Swords },
  shield: { label: 'Щит', Icon: Shield },
  artifact: { label: 'Артефакт', Icon: Sparkles },
};

const DEFAULT_TYPE = ARTIFACT_TYPES.artifact;

export function typeMeta(type: string) {
  return ARTIFACT_TYPES[type as ArtifactType] ?? DEFAULT_TYPE;
}

export const STAT_META: { key: 'power' | 'defense' | 'magic' | 'speed'; label: string; Icon: LucideIcon }[] = [
  { key: 'power', label: 'Сила', Icon: Zap },
  { key: 'defense', label: 'Защита', Icon: Shield },
  { key: 'magic', label: 'Магия', Icon: Sparkles },
  { key: 'speed', label: 'Скорость', Icon: Bolt },
];

/* ---------------- Rarity chain + price formula ----------------
   ЦЕНА = (БАЗА × РЕДКОСТЬ) × (1 + РЕЙТИНГ/100) × (СПРОС / ПРЕДЛОЖЕНИЕ)
   БАЗА = сумма характеристик × 5
------------------------------------------------- */

export const RARITY_CHAIN: ArtifactRarity[] = ['common', 'rare', 'epic', 'legendary', 'mythic'];

const RARITY_MULT: Record<ArtifactRarity, number> = {
  common: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
  mythic: 5,
};

export function nextRarity(r: ArtifactRarity): ArtifactRarity | null {
  const i = RARITY_CHAIN.indexOf(r);
  return i >= 0 && i < RARITY_CHAIN.length - 1 ? RARITY_CHAIN[i + 1] : null;
}

export type Stats = { power: number; defense: number; magic: number; speed: number };

export type PriceInputs = {
  stats: Stats;
  rarity: ArtifactRarity;
  architectLevel: number;
  views24h: number;
  supply: number;
};

export type PriceBreakdown = {
  base: number;
  afterRarity: number;
  afterRating: number;
  demand: number;
  supply: number;
  ratio: number;
  price: number;
};

export function computePrice({ stats, rarity, architectLevel, views24h, supply }: PriceInputs): PriceBreakdown {
  const statSum = stats.power + stats.defense + stats.magic + stats.speed;
  const base = statSum * 5;
  const afterRarity = base * RARITY_MULT[rarity];
  const afterRating = afterRarity * (1 + architectLevel / 100);
  const demand = Math.max(1, Math.round(views24h / 10));
  const safeSupply = Math.max(1, supply);
  const ratio = demand / safeSupply;
  const price = Math.round(afterRating * ratio);
  return { base, afterRarity, afterRating, demand, supply: safeSupply, ratio, price };
}

export function formatTokens(n: number): string {
  return n.toLocaleString('ru-RU');
}

/** Natural listing currency by rarity tier (seller default). */
export function defaultListCurrency(rarity: ArtifactRarity): CurrencyId {
  switch (rarity) {
    case 'common':
      return 'credits';
    case 'rare':
      return 'shards';
    case 'epic':
      return 'shards';
    case 'legendary':
      return 'crystals';
    case 'mythic':
      return 'timecoin';
  }
}

/* ================================================================
   CURRENCY HIERARCHY — Credits ⚡ → Shards ♦ → Crystals 💎 → TimeCoin ∞
   Ascending exchange: 1000 Credits = 1 Shard, 100 Shards = 1 Crystal,
   10 Crystals = 1 TimeCoin. Fiat: 1 TC = $10. Emission: 2 100 000 TC.
   ================================================================ */

export type CurrencyId = 'credits' | 'shards' | 'crystals' | 'timecoin';

export type Currency = {
  id: CurrencyId;
  label: string;
  symbol: string;
  tier: 1 | 2 | 3 | 4;
  rarity: string;
  color: string;
  Icon: LucideIcon;
  /** how many of the NEXT-lower currency equal one of this currency */
  ratePerLower: number;
  /** how many base credits equal one unit of this currency */
  creditRate: number;
  /** who can trade in this currency */
  access: string;
  /** true for the elite ∞ tier (gold glow) */
  elite?: boolean;
};

export const CURRENCIES: Record<CurrencyId, Currency> = {
  credits: { id: 'credits', label: 'Кредиты', symbol: '⚡', tier: 1, rarity: 'Обычная', color: '#F1C40F', Icon: Zap, ratePerLower: 0, creditRate: 1, access: 'Все' },
  shards: { id: 'shards', label: 'Осколки', symbol: '♦', tier: 2, rarity: 'Необычная', color: '#3498DB', Icon: Sparkles, ratePerLower: 1000, creditRate: 1_000, access: 'Все' },
  crystals: { id: 'crystals', label: 'Кристаллы', symbol: '💎', tier: 3, rarity: 'Редкая', color: '#9B59B6', Icon: Gem, ratePerLower: 100, creditRate: 100_000, access: 'Все' },
  timecoin: { id: 'timecoin', label: 'TimeCoin', symbol: '∞', tier: 4, rarity: 'Ультра-редкая', color: '#E74C3C', Icon: InfinityIcon, ratePerLower: 10, creditRate: 1_000_000, access: 'Элита', elite: true },
};

export const CURRENCY_ORDER: CurrencyId[] = ['credits', 'shards', 'crystals', 'timecoin'];

/** Total TC emission (deflationary) */
export const TC_EMISSION = 2_100_000;
/** Fiat price of 1 TimeCoin */
export const TC_USD = 10;

export type Wallet = Record<CurrencyId, number>;

/** Format a TimeCoin amount with the ∞ symbol, e.g. "100 ∞" */
export function formatTC(n: number): string {
  return `${formatTokens(n)} ∞`;
}

export function formatCurrency(id: CurrencyId, n: number): string {
  return `${formatCurrencyAmount(id, n)} ${CURRENCIES[id].symbol}`;
}

/** Format a currency amount, allowing fractional values for high-tier currencies. */
export function formatCurrencyAmount(id: CurrencyId, n: number): string {
  if (id === 'credits' || id === 'shards') return formatTokens(Math.round(n));
  // crystals / timecoin can be fractional
  const rounded = Math.round(n * 1000) / 1000;
  return rounded.toLocaleString('ru-RU', { maximumFractionDigits: 3 });
}

/* ---------------- Multi-currency conversion ----------------
   Every price is anchored in base credits. Convert to any currency by
   dividing by that currency's creditRate. Cross-rate = rateA / rateB.
------------------------------------------------- */

export const EXCHANGE_FEE = 0.01; // 1% converter commission

/** Convert a credit amount into the given currency. */
export function creditsTo(credits: number, id: CurrencyId): number {
  return credits / CURRENCIES[id].creditRate;
}

/** Convert an amount of a currency back into base credits. */
export function toCredits(amount: number, id: CurrencyId): number {
  return amount * CURRENCIES[id].creditRate;
}

/** Price of a credit amount expressed in all four currencies. */
export function priceInAll(credits: number): Record<CurrencyId, number> {
  return {
    credits: creditsTo(credits, 'credits'),
    shards: creditsTo(credits, 'shards'),
    crystals: creditsTo(credits, 'crystals'),
    timecoin: creditsTo(credits, 'timecoin'),
  };
}

/** Cross-rate: how many `from` units buy one `to` unit. */
export function crossRate(from: CurrencyId, to: CurrencyId): number {
  return CURRENCIES[to].creditRate / CURRENCIES[from].creditRate;
}

/** Convert an amount between two arbitrary currencies (no fee). */
export function convertBetween(amount: number, from: CurrencyId, to: CurrencyId): number {
  return toCredits(amount, from) / CURRENCIES[to].creditRate;
}

export type ConvertQuote = {
  from: CurrencyId;
  to: CurrencyId;
  give: number; // amount of `from` spent (incl. fee)
  receive: number; // amount of `to` received
  fee: number; // fee in `from` units
  rate: number; // 1 `to` = rate `from`
};

/** Quote for receiving `wantTo` units of `to`, paying in `from` (with 1% fee). */
export function convertQuote(wantTo: number, from: CurrencyId, to: CurrencyId): ConvertQuote {
  const rate = crossRate(from, to);
  const gross = wantTo * rate;
  const fee = gross * EXCHANGE_FEE;
  return { from, to, give: gross + fee, receive: wantTo, fee, rate };
}

/* ---------------- Genesis cycle: evolution + craft costs ---------------- */

export const CRAFT_COST = 500;
export const HASTE_COST_PER_HOUR = 10;
export const REGISTRATION_BONUS = 10;
export const PLATFORM_FEE = 0.05; // 5%
export const HERITAGE_BONUS = 0.5; // +0.5% rating per sale
export const SPARK_CHANCE = 0.01; // 1% instant mythic

/* ---------------- Hall of Fame · «Вечные творения» (sold ≥ 20 000 ∞) ----------------
   Epic tiers (no religious language): Amber → Sapphire → Diamond.
------------------------------------------------------------------------------------ */

export type HofTier = 'amber' | 'sapphire' | 'diamond';

export const HOF_TIERS: Record<
  HofTier,
  { label: string; min: number; max: number; color: string; glow: string; symbol: string; Icon: LucideIcon }
> = {
  amber: { label: 'Янтарь', min: 20_000, max: 49_999, color: '#FFBF00', glow: 'rgba(255,191,0,0.18)', symbol: '🔶', Icon: Award },
  sapphire: { label: 'Сапфир', min: 50_000, max: 99_999, color: '#4A90E2', glow: 'rgba(15,82,186,0.28)', symbol: '💠', Icon: Gem },
  diamond: { label: 'Алмаз', min: 100_000, max: Infinity, color: '#E6ECFF', glow: 'rgba(224,224,224,0.28)', symbol: '💎', Icon: Crown },
};

export const HOF_TIER_ORDER: HofTier[] = ['diamond', 'sapphire', 'amber'];

export function hofTier(price: number): HofTier | null {
  if (price >= HOF_TIERS.diamond.min) return 'diamond';
  if (price >= HOF_TIERS.sapphire.min) return 'sapphire';
  if (price >= HOF_TIERS.amber.min) return 'amber';
  return null;
}
