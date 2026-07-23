/* ================================================================
   OSGARD · TimeCoin (∞) MARKET — константы, типы и формат-хелперы
   ----------------------------------------------------------------
   Портировано 1:1 из web (lib/tc-market.ts). Реальные данные рынка
   TimeCoin приходят с бэкенда через hooks/useTcMarketQuery.ts.

   Этот файл — источник:
     - констант (символ, цвета, лимиты стейкинга),
     - чистых функций для работы с историей цены/свечами (не моки —
       принимают историю снаружи, ничего не генерируют сами),
     - формат-хелперов (fmtUSD, fmtCompactUSD, fmtTC).
   ================================================================ */

export const TC_SYMBOL = "∞"
export const TC_ACCENT = "#00F0FF" // ∞ brand color
export const UP = "#10B981" // price rising
export const DOWN = "#EF4444" // price falling

/** Total TC emission cap (matches TC_MINTED on backend). */
export const TC_TOTAL_CAP = 2_100_000

/* ---- Staking terms (константы UI, не моковые данные) ---- */
export type StakeTerm = {
  days: number
  apr: number
  marketFee: number // сниженная комиссия маркета на время стейка
  label: string
  perk: string
}

export const STAKE_TERMS: StakeTerm[] = [
  { days: 30, apr: 0.06, marketFee: 0.03, label: "30 дней", perk: "Комиссия маркета 3%" },
  { days: 90, apr: 0.11, marketFee: 0.02, label: "90 дней", perk: "Комиссия 2% + ранний доступ" },
  { days: 180, apr: 0.18, marketFee: 0.01, label: "180 дней", perk: "Комиссия 1% + ∞-бейдж" },
]

export const MIN_STAKE = 10

/* ---- Types (структуры данных, приходящих с бэкенда) ---- */
export type PricePoint = { ts: number; price: number }
export type TCTrade = { id: string; ts: number; price: number; amount: number; side: "buy" | "sell" }
export type OrderRow = { price: number; amount: number; total: number }
export type OrderBook = { bids: OrderRow[]; asks: OrderRow[]; spread: number; mid: number }
export type TxKind = "buy" | "sell" | "burn" | "stake" | "unstake"
export type TCTransaction = {
  id: string
  kind: TxKind
  amountTC: number
  amountUSD: number
  price: number
  ts: number
}
export type Stake = {
  id: string
  amountTC: number
  days: number
  apr: number
  marketFee: number
  startTs: number
  endTs: number
  status: "active" | "closed"
}

export type Timeframe = "day" | "week" | "month" | "year"

export const DAY_MS = 86_400_000

/* ---- Chart helpers (чистые функции — принимают историю снаружи,
   ничего не генерируют/не мокают сами) ---- */
const WINDOW_MS: Record<Timeframe, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
}

/** Filter + downsample price history for a timeframe (<= ~90 points). */
export function historyFor(history: PricePoint[], tf: Timeframe, now: number = Date.now()): PricePoint[] {
  const from = now - WINDOW_MS[tf]
  const slice = history.filter((p) => p.ts >= from)
  const src = slice.length > 1 ? slice : history.slice(-2)
  const maxPts = 90
  if (src.length <= maxPts) return src
  const step = Math.ceil(src.length / maxPts)
  const out: PricePoint[] = []
  for (let i = 0; i < src.length; i += step) out.push(src[i])
  if (out[out.length - 1] !== src[src.length - 1]) out.push(src[src.length - 1])
  return out
}

export type TCCandle = { label: string; o: number; h: number; l: number; c: number }

/** Bucket price history into OHLC candles for the given timeframe. */
export function candlesFor(history: PricePoint[], tf: Timeframe, now: number = Date.now()): TCCandle[] {
  const pts = historyFor(history, tf, now)
  if (pts.length === 0) return []
  const target = tf === "day" ? 12 : tf === "week" ? 14 : tf === "month" ? 20 : 26
  const size = Math.max(1, Math.ceil(pts.length / target))
  const candles: TCCandle[] = []
  for (let i = 0; i < pts.length; i += size) {
    const group = pts.slice(i, i + size)
    const prices = group.map((g) => g.price)
    const o = prices[0]
    const c = prices[prices.length - 1]
    const h = Math.max(...prices)
    const l = Math.min(...prices)
    candles.push({ label: fmtLabel(group[group.length - 1].ts, tf), o, h, l, c })
  }
  return candles
}

function fmtLabel(ts: number, tf: Timeframe): string {
  const d = new Date(ts)
  if (tf === "day") return `${d.getHours().toString().padStart(2, "0")}:00`
  return `${d.getDate().toString().padStart(2, "0")}.${(d.getMonth() + 1).toString().padStart(2, "0")}`
}

/* ---- Formatting (формат-хелперы) ---- */
export function fmtUSD(n: number, max = 2): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: max === 0 ? 0 : 2, maximumFractionDigits: max })}`
}

export function fmtCompactUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

export function fmtTC(n: number): string {
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${TC_SYMBOL}`
}

/** Percent change between two prices. */
export function pctChange(from: number, to: number): number {
  if (from === 0) return 0
  return ((to - from) / from) * 100
}
