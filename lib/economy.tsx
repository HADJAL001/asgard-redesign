import type { LucideIcon } from "lucide-react"
import {
  Brain,
  Zap,
  Gem,
  Shield,
  Star,
  Sparkles,
  Cpu,
  Network,
  CircuitBoard,
  Bot,
  Atom,
  Orbit,
  Rocket,
  Globe,
  Satellite,
  Moon,
  Sun,
  Hammer,
  Anvil,
  Wrench,
  Cog,
  Pickaxe,
  Flame,
  BatteryCharging,
  Bolt,
  Radiation,
  ShieldCheck,
  ShieldHalf,
  Lock,
  KeyRound,
  Target,
  Crosshair,
  Trophy,
  Award,
  Medal,
  Crown,
  Diamond,
  Hexagon,
  Wand2,
  Feather,
  FolderKanban,
  Folder,
  Boxes,
  Package,
  Layers,
  Component,
  Swords,
  Sword,
  Skull,
  Eye,
  Infinity as InfinityIcon,
  Compass,
} from "lucide-react"

/* ================================================================
   OSGARD NEURAL CORE — shared economy model
   Palette: bg #0A0A0F · card #14141E · accent #00D4FF
            text #FFFFFF · label #6A6A8A · border #2A2A3E
   ================================================================ */

export const COLORS = {
  bg: "#0A0A0F",
  card: "#14141E",
  accent: "#00D4FF",
  text: "#FFFFFF",
  label: "#6A6A8A",
  border: "#2A2A3E",
  green: "#4ADE80",
  amber: "#FBBF24",
  red: "#F87171",
} as const

/* ---------------- Rarity ---------------- */

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic"

export const RARITY: Record<
  Rarity,
  { label: string; color: string; mult: number; stars: number; symbol: string; glow?: boolean }
> = {
  common: { label: "Обычный", color: "#6A6A8A", mult: 1, stars: 1, symbol: "○" },
  rare: { label: "Редкий", color: "#4A7A9C", mult: 2, stars: 2, symbol: "◇" },
  epic: { label: "Эпический", color: "#9B59B6", mult: 3, stars: 3, symbol: "◆" },
  legendary: { label: "Легендарный", color: "#F1C40F", mult: 4, stars: 4, symbol: "★" },
  mythic: { label: "Мифический", color: "#E74C3C", mult: 5, stars: 5, symbol: "∞", glow: true },
}

/* Ordered rarity chain for evolution */
export const RARITY_CHAIN: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"]

/* ---------------- Artifact types ---------------- */

export type ArtifactType = "neural" | "crystal" | "weapon" | "shield" | "artifact"

export const ARTIFACT_TYPES: Record<ArtifactType, { label: string; Icon: LucideIcon }> = {
  neural: { label: "Нейросеть", Icon: Brain },
  crystal: { label: "Кристалл", Icon: Gem },
  weapon: { label: "Оружие", Icon: Swords },
  shield: { label: "Щит", Icon: Shield },
  artifact: { label: "Артефакт", Icon: Sparkles },
}

/* ---------------- Stats ---------------- */

export type Stats = { power: number; defense: number; magic: number; speed: number }

export const STAT_META: { key: keyof Stats; label: string; Icon: LucideIcon }[] = [
  { key: "power", label: "Сила", Icon: Zap },
  { key: "defense", label: "Защита", Icon: Shield },
  { key: "magic", label: "Магия", Icon: Sparkles },
  { key: "speed", label: "Скорость", Icon: Bolt },
]

/* ---------------- Price formula ----------------
   ЦЕНА = (БАЗА × РЕДКОСТЬ) × (1 + РЕЙТИНГ/100) × (СПРОС / ПРЕДЛОЖЕНИЕ)
   БАЗА = сумма характеристик × 5
------------------------------------------------- */

export type PriceInputs = {
  stats: Stats
  rarity: Rarity
  architectLevel: number
  views24h: number
  supply: number
}

export type PriceBreakdown = {
  base: number
  afterRarity: number
  afterRating: number
  demand: number
  supply: number
  ratio: number
  price: number
}

export function computePrice({ stats, rarity, architectLevel, views24h, supply }: PriceInputs): PriceBreakdown {
  const statSum = stats.power + stats.defense + stats.magic + stats.speed
  const base = statSum * 5
  const afterRarity = base * RARITY[rarity].mult
  const afterRating = afterRarity * (1 + architectLevel / 100)
  const demand = Math.max(1, Math.round(views24h / 10))
  const safeSupply = Math.max(1, supply)
  const ratio = demand / safeSupply
  const price = Math.round(afterRating * ratio)
  return { base, afterRarity, afterRating, demand, supply: safeSupply, ratio, price }
}

export function formatTokens(n: number): string {
  return n.toLocaleString("ru-RU")
}

/* ---------------- Domain records ---------------- */

export type ArtifactStatus = "kept" | "listed" | "sold"

export type Artifact = {
  id: number
  name: string
  type: ArtifactType
  rarity: Rarity
  level: number
  stats: Stats
  status: ArtifactStatus
  projectId: number
  architect: string
  architectLevel: number
  views24h: number
  supply: number
  price: number
  /** currency the seller listed this artifact in */
  listCurrency: CurrencyId
}

/** Natural listing currency by rarity tier (seller default). */
export function defaultListCurrency(rarity: Rarity): CurrencyId {
  switch (rarity) {
    case "common":
      return "credits"
    case "rare":
      return "shards"
    case "epic":
      return "shards"
    case "legendary":
      return "crystals"
    case "mythic":
      return "timecoin"
  }
}

export type Project = {
  id: number
  name: string
  description: string
  badge: string // badge id
  artifactCount: number
  sold: number
  income: number
}

export type Architect = {
  rank: number
  name: string
  level: number
  income: number
  sales: number
  self?: boolean
}

export type TxType = "buy" | "sell" | "dividend"

export type Transaction = {
  id: string
  type: TxType
  item: string
  counterparty: string
  amount: number
  date: string
  status: "done" | "pending" | "cancelled"
}

/* ---------------- Badge library (50+ thin monochrome icons) ---------------- */

export type BadgeCategory =
  | "neural"
  | "forge"
  | "projects"
  | "space"
  | "energy"
  | "defense"
  | "goals"
  | "magic"
  | "rarity"

export const BADGE_CATEGORIES: { id: BadgeCategory; label: string }[] = [
  { id: "neural", label: "Нейросети" },
  { id: "forge", label: "Кузница" },
  { id: "projects", label: "Проекты" },
  { id: "space", label: "Космос" },
  { id: "energy", label: "Энергия" },
  { id: "defense", label: "Защита" },
  { id: "goals", label: "Цели" },
  { id: "magic", label: "Магия" },
  { id: "rarity", label: "Редкость" },
]

export type Badge = { id: string; category: BadgeCategory; Icon: LucideIcon }

export const BADGES: Badge[] = [
  // Нейросети
  { id: "brain", category: "neural", Icon: Brain },
  { id: "cpu", category: "neural", Icon: Cpu },
  { id: "network", category: "neural", Icon: Network },
  { id: "circuit", category: "neural", Icon: CircuitBoard },
  { id: "bot", category: "neural", Icon: Bot },
  { id: "component", category: "neural", Icon: Component },
  // Кузница
  { id: "hammer", category: "forge", Icon: Hammer },
  { id: "anvil", category: "forge", Icon: Anvil },
  { id: "wrench", category: "forge", Icon: Wrench },
  { id: "cog", category: "forge", Icon: Cog },
  { id: "pickaxe", category: "forge", Icon: Pickaxe },
  { id: "flame", category: "forge", Icon: Flame },
  // Проекты
  { id: "folderkanban", category: "projects", Icon: FolderKanban },
  { id: "folder", category: "projects", Icon: Folder },
  { id: "boxes", category: "projects", Icon: Boxes },
  { id: "package", category: "projects", Icon: Package },
  { id: "layers", category: "projects", Icon: Layers },
  // Космос
  { id: "orbit", category: "space", Icon: Orbit },
  { id: "rocket", category: "space", Icon: Rocket },
  { id: "globe", category: "space", Icon: Globe },
  { id: "satellite", category: "space", Icon: Satellite },
  { id: "moon", category: "space", Icon: Moon },
  { id: "sun", category: "space", Icon: Sun },
  { id: "atom", category: "space", Icon: Atom },
  { id: "compass", category: "space", Icon: Compass },
  // Энергия
  { id: "zap", category: "energy", Icon: Zap },
  { id: "bolt", category: "energy", Icon: Bolt },
  { id: "battery", category: "energy", Icon: BatteryCharging },
  { id: "radiation", category: "energy", Icon: Radiation },
  { id: "flame2", category: "energy", Icon: Flame },
  // Защита
  { id: "shield", category: "defense", Icon: Shield },
  { id: "shieldcheck", category: "defense", Icon: ShieldCheck },
  { id: "shieldhalf", category: "defense", Icon: ShieldHalf },
  { id: "lock", category: "defense", Icon: Lock },
  { id: "key", category: "defense", Icon: KeyRound },
  // Цели
  { id: "target", category: "goals", Icon: Target },
  { id: "crosshair", category: "goals", Icon: Crosshair },
  { id: "trophy", category: "goals", Icon: Trophy },
  { id: "award", category: "goals", Icon: Award },
  { id: "medal", category: "goals", Icon: Medal },
  { id: "eye", category: "goals", Icon: Eye },
  // Магия
  { id: "sparkles", category: "magic", Icon: Sparkles },
  { id: "wand", category: "magic", Icon: Wand2 },
  { id: "feather", category: "magic", Icon: Feather },
  { id: "sword", category: "magic", Icon: Sword },
  { id: "skull", category: "magic", Icon: Skull },
  { id: "infinity", category: "magic", Icon: InfinityIcon },
  // Редкость
  { id: "gem", category: "rarity", Icon: Gem },
  { id: "diamond", category: "rarity", Icon: Diamond },
  { id: "crown", category: "rarity", Icon: Crown },
  { id: "star", category: "rarity", Icon: Star },
  { id: "hexagon", category: "rarity", Icon: Hexagon },
]

export function badgeIcon(id: string): LucideIcon {
  return BADGES.find((b) => b.id === id)?.Icon ?? Folder
}

/* ---------------- Mock data ---------------- */

export const SELF = { name: "Alex Odin", level: 12 }

export const PROJECTS: Project[] = [
  { id: 1, name: "Nebula Core", description: "Нейросетевой движок рендеринга", badge: "brain", artifactCount: 12, sold: 3, income: 4800 },
  { id: 2, name: "Valkyrie UI", description: "Дизайн-система следующего поколения", badge: "layers", artifactCount: 7, sold: 2, income: 3100 },
  { id: 3, name: "Orbital API", description: "Распределённый шлюз данных", badge: "orbit", artifactCount: 9, sold: 4, income: 6400 },
  { id: 4, name: "Photon Grid", description: "Визуализация квантовых потоков", badge: "zap", artifactCount: 5, sold: 1, income: 1500 },
  { id: 5, name: "Helios Auth", description: "Биометрическая система доступа", badge: "shieldcheck", artifactCount: 6, sold: 0, income: 0 },
  { id: 6, name: "Aether Mesh", description: "Сеть периферийных вычислений", badge: "network", artifactCount: 8, sold: 2, income: 2900 },
]

function mk(
  id: number,
  name: string,
  type: ArtifactType,
  rarity: Rarity,
  level: number,
  stats: Stats,
  status: ArtifactStatus,
  projectId: number,
  architect: string,
  architectLevel: number,
  views24h: number,
  supply: number,
): Artifact {
  const price = computePrice({ stats, rarity, architectLevel, views24h, supply }).price
  return {
    id,
    name,
    type,
    rarity,
    level,
    stats,
    status,
    projectId,
    architect,
    architectLevel,
    views24h,
    supply,
    price,
    listCurrency: defaultListCurrency(rarity),
  }
  }

export const ARTIFACTS: Artifact[] = [
  mk(1, "Нейронный процессор", "neural", "legendary", 12, { power: 84, defense: 32, magic: 71, speed: 45 }, "listed", 1, "Alex Odin", 12, 100, 5),
  mk(2, "Молния Тора", "weapon", "epic", 9, { power: 76, defense: 20, magic: 48, speed: 62 }, "listed", 4, "Alex Odin", 12, 60, 8),
  mk(3, "Кристалл Медузы", "crystal", "legendary", 15, { power: 40, defense: 55, magic: 92, speed: 30 }, "listed", 1, "Medusa Code", 18, 140, 4),
  mk(4, "Эгида Валькирии", "shield", "epic", 11, { power: 22, defense: 88, magic: 34, speed: 18 }, "kept", 5, "Alex Odin", 12, 30, 9),
  mk(5, "Артефакт Одина", "artifact", "mythic", 20, { power: 90, defense: 60, magic: 88, speed: 55 }, "kept", 3, "Alex Odin", 12, 200, 3),
  mk(6, "Нейросеть Локи", "neural", "common", 6, { power: 34, defense: 18, magic: 40, speed: 52 }, "kept", 1, "Alex Odin", 12, 20, 12),
  mk(7, "Клинок Фрейи", "weapon", "legendary", 17, { power: 95, defense: 28, magic: 60, speed: 70 }, "listed", 4, "Freya Dev", 15, 120, 6),
  mk(8, "Щит Хеймдалля", "shield", "common", 5, { power: 12, defense: 64, magic: 20, speed: 15 }, "kept", 5, "Alex Odin", 12, 15, 14),
  mk(9, "Кристалл Асгарда", "crystal", "epic", 13, { power: 50, defense: 44, magic: 78, speed: 40 }, "sold", 2, "Alex Odin", 12, 90, 7),
  mk(10, "Ядро Мьёльнира", "artifact", "epic", 14, { power: 82, defense: 50, magic: 55, speed: 48 }, "listed", 3, "Thor Build", 16, 110, 5),
  mk(11, "Сфера Бифрёста", "crystal", "legendary", 19, { power: 60, defense: 40, magic: 96, speed: 58 }, "listed", 1, "Medusa Code", 18, 160, 4),
  mk(12, "Копьё Гунгнир", "weapon", "epic", 10, { power: 80, defense: 24, magic: 50, speed: 66 }, "kept", 4, "Alex Odin", 12, 40, 10),
]

export const ARCHITECTS: Architect[] = [
  { rank: 1, name: "Medusa Code", level: 18, income: 128400, sales: 84 },
  { rank: 2, name: "Thor Build", level: 16, income: 96200, sales: 71 },
  { rank: 3, name: "Freya Dev", level: 15, income: 88700, sales: 63 },
  { rank: 4, name: "Loki Script", level: 14, income: 74300, sales: 58 },
  { rank: 5, name: "Odin Prime", level: 14, income: 69100, sales: 52 },
  { rank: 6, name: "Baldr Stack", level: 13, income: 61500, sales: 47 },
  { rank: 7, name: "Alex Odin", level: 12, income: 54200, sales: 43, self: true },
  { rank: 8, name: "Frigg Cloud", level: 12, income: 49800, sales: 39 },
  { rank: 9, name: "Tyr Kernel", level: 11, income: 42600, sales: 34 },
  { rank: 10, name: "Vidar Node", level: 10, income: 37900, sales: 29 },
]

export const TRANSACTIONS: Transaction[] = [
  { id: "TX-1042", type: "sell", item: "Артефакт Одина", counterparty: "Thor Build", amount: 8376, date: "18.07.2026", status: "done" },
  { id: "TX-1041", type: "buy", item: "Клинок Фрейи", counterparty: "Freya Dev", amount: 5200, date: "17.07.2026", status: "done" },
  { id: "TX-1040", type: "dividend", item: "Роялти с Nebula Core", counterparty: "Система", amount: 340, date: "17.07.2026", status: "done" },
  { id: "TX-1039", type: "sell", item: "Кристалл Асгарда", counterparty: "Loki Script", amount: 4188, date: "15.07.2026", status: "done" },
  { id: "TX-1038", type: "buy", item: "Ядро Мьёльнира", counterparty: "Thor Build", amount: 3600, date: "14.07.2026", status: "done" },
  { id: "TX-1037", type: "sell", item: "Молния Тора", counterparty: "Odin Prime", amount: 1200, date: "13.07.2026", status: "pending" },
  { id: "TX-1036", type: "dividend", item: "Роялти с Orbital API", counterparty: "Система", amount: 210, date: "12.07.2026", status: "done" },
  { id: "TX-1035", type: "sell", item: "Сфера Бифрёста", counterparty: "Baldr Stack", amount: 6400, date: "11.07.2026", status: "cancelled" },
]

export const TX_META: Record<TxType, { label: string; color: string }> = {
  buy: { label: "Покупка", color: "#4ADE80" },
  sell: { label: "Продажа", color: "#F87171" },
  dividend: { label: "Дивиденды", color: "#FBBF24" },
}

export const TX_STATUS: Record<Transaction["status"], { label: string; color: string }> = {
  done: { label: "Завершена", color: "#4ADE80" },
  pending: { label: "В ожидании", color: "#FBBF24" },
  cancelled: { label: "Отменена", color: "#F87171" },
}

/* ================================================================
   CURRENCY HIERARCHY — Credits ⚡ → Shards ♦ → Crystals 💎 → TimeCoin ∞
   Ascending exchange: 1000 Credits = 1 Shard, 100 Shards = 1 Crystal,
   10 Crystals = 1 TimeCoin. Fiat: 1 TC = $10. Emission: 2 100 000 TC.
   ================================================================ */

export type CurrencyId = "credits" | "shards" | "crystals" | "timecoin"

export type Currency = {
  id: CurrencyId
  label: string
  symbol: string
  tier: 1 | 2 | 3 | 4
  rarity: string
  color: string
  Icon: LucideIcon
  /** how many of the NEXT-lower currency equal one of this currency */
  ratePerLower: number
  /** how many base credits equal one unit of this currency */
  creditRate: number
  /** who can trade in this currency */
  access: string
  /** true for the elite ∞ tier (gold glow) */
  elite?: boolean
}

export const CURRENCIES: Record<CurrencyId, Currency> = {
  credits: { id: "credits", label: "Кредиты", symbol: "⚡", tier: 1, rarity: "Обычная", color: "#F1C40F", Icon: Zap, ratePerLower: 0, creditRate: 1, access: "Все" },
  shards: { id: "shards", label: "Осколки", symbol: "♦", tier: 2, rarity: "Необычная", color: "#3498DB", Icon: Sparkles, ratePerLower: 1000, creditRate: 1_000, access: "Все" },
  crystals: { id: "crystals", label: "Кристаллы", symbol: "💎", tier: 3, rarity: "Редкая", color: "#9B59B6", Icon: Gem, ratePerLower: 100, creditRate: 100_000, access: "Все" },
  timecoin: { id: "timecoin", label: "TimeCoin", symbol: "∞", tier: 4, rarity: "Ультра-редкая", color: "#E74C3C", Icon: InfinityIcon, ratePerLower: 10, creditRate: 1_000_000, access: "Элита", elite: true },
}

export const CURRENCY_ORDER: CurrencyId[] = ["credits", "shards", "crystals", "timecoin"]

/** Total TC emission (deflationary) */
export const TC_EMISSION = 2_100_000
/** Fiat price of 1 TimeCoin */
export const TC_USD = 10

export type Wallet = Record<CurrencyId, number>

export const INITIAL_WALLET: Wallet = {
  credits: 48_500,
  shards: 320,
  crystals: 86,
  timecoin: 74_310,
}

/** Format a TimeCoin amount with the ∞ symbol, e.g. "100 ∞" */
export function formatTC(n: number): string {
  return `${formatTokens(n)} ∞`
}

export function formatCurrency(id: CurrencyId, n: number): string {
  return `${formatCurrencyAmount(id, n)} ${CURRENCIES[id].symbol}`
}

/** Format a currency amount, allowing fractional values for high-tier currencies. */
export function formatCurrencyAmount(id: CurrencyId, n: number): string {
  if (id === "credits" || id === "shards") return formatTokens(Math.round(n))
  // crystals / timecoin can be fractional
  const rounded = Math.round(n * 1000) / 1000
  return rounded.toLocaleString("ru-RU", { maximumFractionDigits: 3 })
}

/* ---------------- Multi-currency conversion ----------------
   Every price is anchored in base credits. Convert to any currency by
   dividing by that currency's creditRate. Cross-rate = rateA / rateB.
------------------------------------------------------------- */

export const EXCHANGE_FEE = 0.01 // 1% converter commission

/** Convert a credit amount into the given currency. */
export function creditsTo(credits: number, id: CurrencyId): number {
  return credits / CURRENCIES[id].creditRate
}

/** Convert an amount of a currency back into base credits. */
export function toCredits(amount: number, id: CurrencyId): number {
  return amount * CURRENCIES[id].creditRate
}

/** Price of a credit amount expressed in all four currencies. */
export function priceInAll(credits: number): Record<CurrencyId, number> {
  return {
    credits: creditsTo(credits, "credits"),
    shards: creditsTo(credits, "shards"),
    crystals: creditsTo(credits, "crystals"),
    timecoin: creditsTo(credits, "timecoin"),
  }
}

/** Cross-rate: how many `from` units buy one `to` unit. */
export function crossRate(from: CurrencyId, to: CurrencyId): number {
  return CURRENCIES[to].creditRate / CURRENCIES[from].creditRate
}

/** Convert an amount between two arbitrary currencies (no fee). */
export function convertBetween(amount: number, from: CurrencyId, to: CurrencyId): number {
  return toCredits(amount, from) / CURRENCIES[to].creditRate
}

export type ConvertQuote = {
  from: CurrencyId
  to: CurrencyId
  give: number // amount of `from` spent (incl. fee)
  receive: number // amount of `to` received
  fee: number // fee in `from` units
  rate: number // 1 `to` = rate `from`
}

/** Quote for receiving `wantTo` units of `to`, paying in `from` (with 1% fee). */
export function convertQuote(wantTo: number, from: CurrencyId, to: CurrencyId): ConvertQuote {
  const rate = crossRate(from, to)
  const gross = wantTo * rate
  const fee = gross * EXCHANGE_FEE
  return { from, to, give: gross + fee, receive: wantTo, fee, rate }
}

/* ---------------- Genesis cycle: evolution + craft costs ---------------- */

/** TC cost to evolve FROM a given rarity to the next one */
export const UPGRADE_COST: Partial<Record<Rarity, number>> = {
  common: 100, // → rare
  rare: 1_000, // → epic
  epic: 10_000, // → legendary
  legendary: 50_000, // → mythic
}

export const CRAFT_COST = 500
export const HASTE_COST_PER_HOUR = 10
export const REGISTRATION_BONUS = 10
export const PLATFORM_FEE = 0.05 // 5%
export const HERITAGE_BONUS = 0.5 // +0.5% rating per sale
export const SPARK_CHANCE = 0.01 // 1% instant mythic

export function nextRarity(r: Rarity): Rarity | null {
  const i = RARITY_CHAIN.indexOf(r)
  return i >= 0 && i < RARITY_CHAIN.length - 1 ? RARITY_CHAIN[i + 1] : null
}

/* ---------------- Artifact genealogy ---------------- */

export type LineageStep =
  | { kind: "birth"; projectId: number; project: string; date: string }
  | { kind: "evolve"; from: Rarity; to: Rarity; cost: number; date: string }
  | { kind: "craft"; parents: string[]; date: string }

/** Deterministic mock lineage for an artifact */
export function lineageFor(a: Artifact): LineageStep[] {
  const project = PROJECTS.find((p) => p.id === a.projectId)
  const steps: LineageStep[] = [
    { kind: "birth", projectId: a.projectId, project: project?.name ?? "—", date: "01.06.2026" },
  ]
  const chainIndex = RARITY_CHAIN.indexOf(a.rarity)
  for (let i = 0; i < chainIndex; i++) {
    const from = RARITY_CHAIN[i]
    const to = RARITY_CHAIN[i + 1]
    steps.push({ kind: "evolve", from, to, cost: UPGRADE_COST[from] ?? 0, date: `${10 + i}.06.2026` })
  }
  if (a.id % 3 === 0) {
    steps.push({ kind: "craft", parents: ["Осколок #A" + a.id, "Осколок #B" + a.id], date: "28.06.2026" })
  }
  return steps
}

/* ---------------- Hall of Fame · «Вечные творения» (sold ≥ 20 000 ∞) ----------------
   Epic tiers (no religious language): Amber → Sapphire → Diamond.
------------------------------------------------------------------------------------ */

export type HofTier = "amber" | "sapphire" | "diamond"

export const HOF_TIERS: Record<
  HofTier,
  { label: string; min: number; max: number; color: string; glow: string; symbol: string; Icon: LucideIcon }
> = {
  amber: { label: "Янтарь", min: 20_000, max: 49_999, color: "#FFBF00", glow: "rgba(255,191,0,0.18)", symbol: "🔶", Icon: Award },
  sapphire: { label: "Сапфир", min: 50_000, max: 99_999, color: "#4A90E2", glow: "rgba(15,82,186,0.28)", symbol: "💠", Icon: Gem },
  diamond: { label: "Алмаз", min: 100_000, max: Infinity, color: "#E6ECFF", glow: "rgba(224,224,224,0.28)", symbol: "💎", Icon: Crown },
}

export const HOF_TIER_ORDER: HofTier[] = ["diamond", "sapphire", "amber"]

export function hofTier(price: number): HofTier | null {
  if (price >= HOF_TIERS.diamond.min) return "diamond"
  if (price >= HOF_TIERS.sapphire.min) return "sapphire"
  if (price >= HOF_TIERS.amber.min) return "amber"
  return null
}

export type HofEntry = {
  id: number
  artifact: string
  type: ArtifactType
  rarity: Rarity
  architect: string
  price: number
  date: string
}

export const HALL_OF_FAME: HofEntry[] = [
  { id: 1, artifact: "Нейронная Вселенная", type: "neural", rarity: "mythic", architect: "GOLD_ARCHITECT", price: 104_500, date: "12.07.2026" },
  { id: 2, artifact: "Артефакт Одина", type: "artifact", rarity: "mythic", architect: "Alex Odin", price: 128_400, date: "10.07.2026" },
  { id: 3, artifact: "Сфера Бифрёста", type: "crystal", rarity: "mythic", architect: "Medusa Code", price: 112_900, date: "02.07.2026" },
  { id: 4, artifact: "Кристалл Вечности", type: "crystal", rarity: "mythic", architect: "Alex Odin", price: 87_200, date: "10.07.2026" },
  { id: 5, artifact: "Клинок Фрейи", type: "weapon", rarity: "legendary", architect: "Freya Dev", price: 96_200, date: "24.06.2026" },
  { id: 6, artifact: "Врата Сингулярности", type: "artifact", rarity: "legendary", architect: "Nova Stack", price: 81_400, date: "16.07.2026" },
  { id: 7, artifact: "Ядро Мьёльнира", type: "artifact", rarity: "legendary", architect: "Thor Build", price: 74_300, date: "19.06.2026" },
  { id: 8, artifact: "Пульсар Памяти", type: "neural", rarity: "legendary", architect: "Medusa Code", price: 66_800, date: "14.07.2026" },
  { id: 9, artifact: "Кристалл Медузы", type: "crystal", rarity: "legendary", architect: "Medusa Code", price: 61_500, date: "11.06.2026" },
  { id: 10, artifact: "Спираль Времени", type: "artifact", rarity: "legendary", architect: "Chrono Dev", price: 54_900, date: "09.07.2026" },
  { id: 11, artifact: "Нейронный процессор", type: "neural", rarity: "legendary", architect: "Alex Odin", price: 42_600, date: "03.06.2026" },
  { id: 12, artifact: "Эгида Валькирии", type: "shield", rarity: "epic", architect: "Loki Script", price: 37_900, date: "28.05.2026" },
  { id: 13, artifact: "Щит Бесконечности", type: "shield", rarity: "epic", architect: "Medusa_Code", price: 32_800, date: "08.07.2026" },
  { id: 14, artifact: "Копьё Гунгнир", type: "weapon", rarity: "epic", architect: "Baldr Stack", price: 24_800, date: "20.05.2026" },
  { id: 15, artifact: "Осколок Кванта", type: "crystal", rarity: "epic", architect: "Vega Code", price: 21_300, date: "05.07.2026" },
]

/* ---------------- Elite access (∞-badge / mythic owner) ---------------- */

export function hasEliteAccess(): boolean {
  // Alex Odin owns a Hall-of-Fame artifact → elite access granted
  return HALL_OF_FAME.some((e) => e.architect === SELF.name)
}

export const INFINITY_BADGES: { id: string; label: string; date: string }[] = [
  { id: "hof-odin", label: "Легенда OSGARD · Артефакт Одина", date: "10.07.2026" },
  { id: "hof-neural", label: "Легенда OSGARD · Нейронный процессор", date: "03.06.2026" },
]

/* ---------------- Economy statistics (mock series) ---------------- */

export const EMISSION_SERIES = [
  { month: "Фев", circulating: 180_000, treasury: 12_000, burned: 4_000 },
  { month: "Мар", circulating: 260_000, treasury: 21_000, burned: 9_500 },
  { month: "Апр", circulating: 340_000, treasury: 33_000, burned: 18_200 },
  { month: "Май", circulating: 430_000, treasury: 48_000, burned: 31_000 },
  { month: "Июн", circulating: 520_000, treasury: 67_000, burned: 52_400 },
  { month: "Июл", circulating: 610_000, treasury: 88_000, burned: 74_800 },
]

/* ================================================================
   EXCHANGE — trading terminal mock data (deterministic).
   Every asset is priced in base credits; the terminal converts to
   the trader's selected currency for display.
   ================================================================ */

/** Small deterministic PRNG so charts are stable across renders. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

export type TradableAsset = {
  id: number
  name: string
  ticker: string
  rarity: Rarity
  architect: string
  /** last price in base credits */
  last: number
  /** % change over 24h */
  change: number
  listCurrency: CurrencyId
}

const TICKERS: Record<string, string> = {
  "Нейронный процессор": "NEUR",
  "Молния Тора": "THOR",
  "Кристалл памяти": "MEMX",
  "Артефакт Одина": "ODIN",
  "Эгида Валькирии": "VALK",
  "Сфера Бифрёста": "BFRS",
}

export const ASSETS: TradableAsset[] = ARTIFACTS.filter((a) => a.status !== "sold").map((a, i) => {
  const r = rng(a.id * 97 + 13)
  return {
    id: a.id,
    name: a.name,
    ticker: TICKERS[a.name] ?? `ART${a.id}`,
    rarity: a.rarity,
    architect: a.architect,
    last: a.price,
    change: Math.round((r() * 12 - 5) * 10) / 10,
    listCurrency: a.listCurrency,
  }
})

export type Candle = { t: string; o: number; h: number; l: number; c: number }

/** Deterministic OHLC candle series (in base credits) around an asset's last price. */
export function genCandles(assetId: number, last: number, count = 24): Candle[] {
  const r = rng(assetId * 131 + 7)
  const candles: Candle[] = []
  let price = last * (0.82 + r() * 0.1)
  for (let i = 0; i < count; i++) {
    const o = price
    const drift = (r() - 0.46) * last * 0.05
    const c = Math.max(last * 0.4, o + drift)
    const h = Math.max(o, c) * (1 + r() * 0.03)
    const l = Math.min(o, c) * (1 - r() * 0.03)
    const day = ((i % 30) + 1).toString().padStart(2, "0")
    candles.push({
      t: `${day}.07`,
      o: Math.round(o),
      h: Math.round(h),
      l: Math.round(l),
      c: Math.round(c),
    })
    price = c
  }
  // nudge final close to the actual last price
  candles[candles.length - 1].c = last
  return candles
}

export type BookRow = { price: number; size: number; total: number }

/** Order book (bids below mid, asks above) in base credits. */
export function genOrderBook(mid: number, assetId: number): { bids: BookRow[]; asks: BookRow[] } {
  const r = rng(assetId * 311 + 5)
  const step = Math.max(1, Math.round(mid * 0.004))
  const build = (dir: -1 | 1): BookRow[] => {
    let total = 0
    return Array.from({ length: 6 }).map((_, i) => {
      const size = Math.round(1 + r() * 8)
      total += size
      return { price: mid + dir * step * (i + 1), size, total }
    })
  }
  return { bids: build(-1), asks: build(1) }
}

export type Trade = { time: string; price: number; size: number; side: "buy" | "sell" }

export function genTrades(mid: number, assetId: number, count = 8): Trade[] {
  const r = rng(assetId * 733 + 3)
  const step = Math.max(1, Math.round(mid * 0.004))
  return Array.from({ length: count }).map((_, i) => {
    const side: "buy" | "sell" = r() > 0.5 ? "buy" : "sell"
    const h = 12
    const m = (55 - i * 5 + 60) % 60
    return {
      time: `${h}:${m.toString().padStart(2, "0")}`,
      price: mid + (side === "buy" ? 1 : -1) * step * Math.round(r() * 2),
      size: Math.round(1 + r() * 5),
      side,
    }
  })
}
