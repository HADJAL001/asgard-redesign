/* ================================================================
   OSGARD · TimeCoin (∞) MARKET ENGINE
   ----------------------------------------------------------------
   Price is discovered purely by trades on the internal order book.
   Buying pushes price up, selling pushes it down, burning and
   staking reduce circulating supply. No artificial jumps, no fixed
   rate — everything is organic supply & demand.
   ================================================================ */

export const TC_SYMBOL = "∞"
export const TC_ACCENT = "#00D4FF" // ∞ brand color
export const UP = "#10B981" // price rising
export const DOWN = "#EF4444" // price falling

/* ---- Supply model (deflationary, hard cap) ---- */
export const TC_TOTAL_CAP = 2_100_000 // maximum emission, ever
export const TC_MINTED = 900_000 // released into existence so far
export const TC_BURNED_BASE = 96_400 // burned baseline (fees + upgrades + crafts)
export const TC_STAKED_BASE = 240_000 // platform-wide staked baseline

/* ---- Market params ---- */
export const TC_START_PRICE = 12.4 // current USD price (last trade)
export const TRADE_FEE = 0.005 // 0.5% exchange fee (always shown)
export const START_CASH_USD = 5_000 // demo trader's starting cash
/** Liquidity depth — larger = gentler price impact (no crashes). */
const DEPTH_TC = 180_000

/* ---- Staking terms ---- */
export type StakeTerm = {
  days: number
  apr: number
  marketFee: number // reduced marketplace fee while staked
  label: string
  perk: string
}

export const STAKE_TERMS: StakeTerm[] = [
  { days: 30, apr: 0.06, marketFee: 0.03, label: "30 дней", perk: "Комиссия маркета 3%" },
  { days: 90, apr: 0.11, marketFee: 0.02, label: "90 дней", perk: "Комиссия 2% + ранний доступ" },
  { days: 180, apr: 0.18, marketFee: 0.01, label: "180 дней", perk: "Комиссия 1% + ∞-бейдж" },
]

export const MIN_STAKE = 10

/* ---- Types ---- */
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

/* ---- Deterministic PRNG (stable across renders) ---- */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/**
 * Seed a realistic daily price history that ENDS exactly at TC_START_PRICE.
 * Gentle upward random walk (organic growth, no vertical spikes).
 */
export function seedPriceHistory(now: number = Date.now()): PricePoint[] {
  const r = rng(20260718)
  const days = 365
  // Fixed anchors → guaranteed organic uptrend, ending at the live price.
  // day 0 (~1yr ago) $6.20 → day 335 (30d ago) $10.00 → day 365 (now) $12.40 (+24% last month)
  const anchors: [number, number][] = [
    [0, 6.2],
    [120, 7.4],
    [240, 8.9],
    [335, 10.0],
    [days, TC_START_PRICE],
  ]
  const priceAt = (i: number): number => {
    for (let s = 0; s < anchors.length - 1; s++) {
      const [i0, p0] = anchors[s]
      const [i1, p1] = anchors[s + 1]
      if (i >= i0 && i <= i1) {
        const f = (i - i0) / (i1 - i0)
        return p0 * Math.pow(p1 / p0, f) // smooth exponential segment
      }
    }
    return anchors[anchors.length - 1][1]
  }
  const isAnchor = (i: number) => anchors.some((a) => a[0] === i)
  const points: PricePoint[] = []
  for (let i = 0; i <= days; i++) {
    const base = priceAt(i)
    const noise = isAnchor(i) ? 0 : (r() - 0.5) * 0.02
    points.push({
      ts: now - (days - i) * DAY_MS,
      price: Math.round(base * (1 + noise) * 100) / 100,
    })
  }
  return points
}

/** Seed a handful of recent trades around the current price. */
export function seedTrades(price: number, now: number = Date.now()): TCTrade[] {
  const r = rng(778201)
  return Array.from({ length: 14 }).map((_, i) => {
    const side: "buy" | "sell" = r() > 0.46 ? "buy" : "sell"
    return {
      id: `seed-${i}`,
      ts: now - i * 47_000,
      price: Math.round(price * (1 + (r() - 0.5) * 0.006) * 100) / 100,
      amount: Math.round((2 + r() * 40) * 100) / 100,
      side,
    }
  })
}

/**
 * Build a live order book around the current price. Deterministic per
 * price bucket so it feels stable but shifts as the price moves.
 */
export function buildOrderBook(price: number): OrderBook {
  const seed = Math.round(price * 100)
  const r = rng(seed * 31 + 7)
  const tick = Math.max(0.01, Math.round(price * 0.0025 * 100) / 100)
  const spread = tick
  const build = (dir: -1 | 1): OrderRow[] => {
    let total = 0
    return Array.from({ length: 8 }).map((_, i) => {
      const amount = Math.round((5 + r() * 120) * 100) / 100
      total = Math.round((total + amount) * 100) / 100
      const p = Math.round((price + dir * tick * (i + 1)) * 100) / 100
      return { price: p, amount, total }
    })
  }
  return { bids: build(-1), asks: build(1), spread, mid: price }
}

/** New price after a market order of `amountTC` (buy pushes up, sell down). */
export function priceAfterTrade(price: number, amountTC: number, side: "buy" | "sell"): number {
  const impact = amountTC / DEPTH_TC // fraction
  const factor = side === "buy" ? 1 + impact : 1 - impact
  return Math.max(0.01, Math.round(price * factor * 100) / 100)
}

/* ---- Chart helpers ---- */
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

/* ---- Formatting ---- */
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
