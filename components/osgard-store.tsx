"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import {
  CURRENCIES,
  INITIAL_WALLET,
  convertQuote,
  toCredits,
  type CurrencyId,
  type Wallet,
} from "@/lib/economy"
import {
  DAY_MS,
  MIN_STAKE,
  STAKE_TERMS,
  pctChange,
  type OrderBook,
  type OrderRow,
  type PricePoint,
  type Stake,
  type TCTrade,
  type TCTransaction,
} from "@/lib/tc-market"

/* ================================================================
   OSGARD global store — wallet + economy actions.
   Client-side context that survives navigation within the app.

   ШАГ 5 (ФИНАЛЬНЫЙ): buildOrderBook / seedTrades / priceAfterTrade /
   seedPriceHistory были удалены из lib/tc-market.ts (там больше нет
   моковых генераторов данных). Этот демонстрационный Context-стор
   по-прежнему нуждается в них для локальной симуляции рынка TimeCoin,
   поэтому приватные копии этих функций перенесены сюда — они больше
   не экспортируются из lib/tc-market.ts и используются только внутри
   этого файла.
   ================================================================ */

export const TC_START_PRICE = 12.4
export const TC_MINTED = 2_100_000
export const TC_BURNED_BASE = 412_000
export const TC_STAKED_BASE = 268_000
export const START_CASH_USD = 25_000
export const TRADE_FEE = 0.01

/* ---------------- Приватные мок-генераторы (не экспортируются) ---------------- */

/** Small deterministic PRNG so history/order book are stable across renders. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

/** Deterministic seeded price history for the demo TimeCoin chart. */
function seedPriceHistory(): PricePoint[] {
  const r = rng(42)
  const now = Date.now()
  const points: PricePoint[] = []
  let price = TC_START_PRICE * 0.8
  const count = 180
  for (let i = count; i >= 0; i--) {
    const ts = now - i * (DAY_MS / 6)
    const drift = (r() - 0.48) * price * 0.03
    price = Math.max(0.5, price + drift)
    points.push({ ts, price: Math.round(price * 100) / 100 })
  }
  points[points.length - 1] = { ts: now, price: TC_START_PRICE }
  return points
}

/** Deterministic seeded recent trades for the demo TimeCoin tape. */
function seedTrades(startPrice: number): TCTrade[] {
  const r = rng(97)
  const now = Date.now()
  const trades: TCTrade[] = []
  let price = startPrice
  for (let i = 40; i >= 0; i--) {
    const ts = now - i * 45_000
    const side: "buy" | "sell" = r() > 0.5 ? "buy" : "sell"
    const drift = (r() - 0.5) * price * 0.004
    price = Math.max(0.5, price + (side === "buy" ? Math.abs(drift) : -Math.abs(drift)))
    trades.push({
      id: `seed-${i}`,
      ts,
      price: Math.round(price * 100) / 100,
      amount: Math.round((1 + r() * 20) * 100) / 100,
      side,
    })
  }
  return trades.reverse()
}

/** Build a live order book derived from the current TimeCoin price. */
function buildOrderBook(mid: number): OrderBook {
  const r = rng(Math.round(mid * 1000))
  const step = Math.max(0.01, Math.round(mid * 0.002 * 100) / 100)
  const build = (dir: -1 | 1): OrderRow[] => {
    let total = 0
    return Array.from({ length: 8 }).map((_, i) => {
      const amount = Math.round((5 + r() * 40) * 100) / 100
      total += amount
      return {
        price: Math.round((mid + dir * step * (i + 1)) * 100) / 100,
        amount,
        total: Math.round(total * 100) / 100,
      }
    })
  }
  const bids = build(-1)
  const asks = build(1)
  const spread = Math.round((asks[0].price - bids[0].price) * 100) / 100
  return { bids, asks, spread, mid: Math.round(mid * 100) / 100 }
}

/** Compute the new TimeCoin price after a simulated trade (simple market-impact model). */
function priceAfterTrade(price: number, amount: number, side: "buy" | "sell"): number {
  const impact = Math.min(0.08, (amount / 5_000) * 0.5)
  const next = side === "buy" ? price * (1 + impact) : price * (1 - impact)
  return Math.max(0.01, Math.round(next * 100) / 100)
}

/* ================================================================ */

type ExchangeResult = { ok: boolean; message: string }

type StoreValue = {
  wallet: Wallet
  /** Convert `amount` of a lower-tier currency up into the next tier. */
  exchangeUp: (from: CurrencyId, amount: number) => ExchangeResult
  /** Add TimeCoin (e.g. after a fiat purchase). */
  addTC: (amount: number) => void
  /** Spend TimeCoin (upgrades, crafting, purchases). Returns false if insufficient. */
  spendTC: (amount: number) => boolean
  /** Spend any currency. Returns false if insufficient. */
  spend: (currency: CurrencyId, amount: number) => boolean
  /** Credit `amount` of a currency to the wallet. */
  credit: (currency: CurrencyId, amount: number) => void
  /** Convert to receive `wantTo` units of `to`, paying in `from` (1% fee). */
  convert: (wantTo: number, from: CurrencyId, to: CurrencyId) => ExchangeResult
  /** Total net worth expressed in TimeCoin. */
  netWorthTC: number
  /** USD value of a TC amount at the live market price. */
  usdFor: (tc: number) => number

  /* ---- TimeCoin market (price discovered by trades) ---- */
  /** Live TC/USD price (last trade). */
  tcPrice: number
  /** Full price history (seed + live points). */
  priceHistory: PricePoint[]
  /** Recent trades (newest first). */
  tcTrades: TCTrade[]
  /** Transaction log (buy/sell/burn/stake/unstake). */
  tcTransactions: TCTransaction[]
  /** Active + closed stakes. */
  stakes: Stake[]
  /** Live order book derived from the current price. */
  orderBook: OrderBook
  /** Demo trader USD cash balance. */
  cashUSD: number
  /** Total TC burned (baseline + session). */
  burnedTC: number
  /** Total TC staked platform-wide (baseline + user stakes). */
  stakedTC: number
  /** Circulating supply = minted − burned − staked. */
  circulatingTC: number
  /** Market cap in USD = price × circulating. */
  marketCapUSD: number
  /** 24h traded volume in TC. */
  volume24hTC: number
  /** % price change over 24h. */
  change24h: number
  /** % price change over 30d. */
  changeMonth: number

  /** Buy TC for `usd` (raises price). */
  buyTC: (usd: number) => ExchangeResult
  /** Sell `tc` for USD (lowers price). */
  sellTC: (tc: number) => ExchangeResult
  /** Lock `amount` TC for a term (reduces supply). */
  stakeTC: (amount: number, days: number) => ExchangeResult
  /** Release a stake with rewards (increases supply). */
  unstakeTC: (id: string) => ExchangeResult
  /** Record a TC burn (upgrades/crafts/fees). */
  recordBurn: (amount: number, note?: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function OsgardStoreProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet>(INITIAL_WALLET)

  /* ---- TimeCoin market state (seeded once) ---- */
  const [tcPrice, setTcPrice] = useState<number>(TC_START_PRICE)
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>(() => seedPriceHistory())
  const [tcTrades, setTcTrades] = useState<TCTrade[]>(() => seedTrades(TC_START_PRICE))
  const [tcTransactions, setTcTransactions] = useState<TCTransaction[]>([])
  const [stakes, setStakes] = useState<Stake[]>([])
  const [cashUSD, setCashUSD] = useState<number>(START_CASH_USD)
  const [sessionBurned, setSessionBurned] = useState<number>(0)

  const exchangeUp = useCallback<StoreValue["exchangeUp"]>((from, amount) => {
    const order: CurrencyId[] = ["credits", "shards", "crystals", "timecoin"]
    const idx = order.indexOf(from)
    if (idx < 0 || idx >= order.length - 1) {
      return { ok: false, message: "Нельзя обменять эту валюту вверх" }
    }
    const target = order[idx + 1]
    const rate = CURRENCIES[target].ratePerLower
    if (amount <= 0 || amount % rate !== 0) {
      return { ok: false, message: `Сумма должна быть кратна ${rate}` }
    }
    let ok = true
    setWallet((w) => {
      if (w[from] < amount) {
        ok = false
        return w
      }
      const gained = Math.floor(amount / rate)
      return { ...w, [from]: w[from] - amount, [target]: w[target] + gained }
    })
    return ok
      ? { ok: true, message: `Обменяно ${amount} → ${Math.floor(amount / rate)} ${CURRENCIES[target].symbol}` }
      : { ok: false, message: "Недостаточно средств" }
  }, [])

  const addTC = useCallback<StoreValue["addTC"]>((amount) => {
    setWallet((w) => ({ ...w, timecoin: w.timecoin + amount }))
  }, [])

  const spendTC = useCallback<StoreValue["spendTC"]>((amount) => {
    let ok = true
    setWallet((w) => {
      if (w.timecoin < amount) {
        ok = false
        return w
      }
      return { ...w, timecoin: w.timecoin - amount }
    })
    return ok
  }, [])

  const spend = useCallback<StoreValue["spend"]>((currency, amount) => {
    let ok = true
    setWallet((w) => {
      if (w[currency] < amount) {
        ok = false
        return w
      }
      return { ...w, [currency]: w[currency] - amount }
    })
    return ok
  }, [])

  const credit = useCallback<StoreValue["credit"]>((currency, amount) => {
    setWallet((w) => ({ ...w, [currency]: w[currency] + amount }))
  }, [])

  const convert = useCallback<StoreValue["convert"]>((wantTo, from, to) => {
    if (from === to) return { ok: false, message: "Выберите разные валюты" }
    if (wantTo <= 0) return { ok: false, message: "Введите сумму" }
    const quote = convertQuote(wantTo, from, to)
    let ok = true
    setWallet((w) => {
      if (w[from] < quote.give) {
        ok = false
        return w
      }
      return { ...w, [from]: w[from] - quote.give, [to]: w[to] + quote.receive }
    })
    return ok
      ? {
          ok: true,
          message: `Обмен выполнен: −${quote.give.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${CURRENCIES[from].symbol} → +${wantTo} ${CURRENCIES[to].symbol}`,
        }
      : { ok: false, message: `Недостаточно ${CURRENCIES[from].label.toLowerCase()}` }
  }, [])

  const netWorthTC = useMemo(
    () =>
      (Object.keys(wallet) as CurrencyId[]).reduce(
        (sum, id) => sum + toCredits(wallet[id], id) / CURRENCIES.timecoin.creditRate,
        0,
      ),
    [wallet],
  )

  const usdFor = useCallback<StoreValue["usdFor"]>((tc) => tc * tcPrice, [tcPrice])

  /* ---- Market derived values ---- */
  const stakedTC = useMemo(
    () => TC_STAKED_BASE + stakes.filter((s) => s.status === "active").reduce((sum, s) => sum + s.amountTC, 0),
    [stakes],
  )
  const burnedTC = TC_BURNED_BASE + sessionBurned
  const circulatingTC = Math.max(0, TC_MINTED - burnedTC - stakedTC)
  const marketCapUSD = circulatingTC * tcPrice

  const volume24hTC = useMemo(() => {
    const from = Date.now() - DAY_MS
    const session = tcTrades.filter((t) => t.ts >= from).reduce((s, t) => s + t.amount, 0)
    return 18_400 + session // seeded baseline + session activity
  }, [tcTrades])

  const change24h = useMemo(() => {
    const from = Date.now() - DAY_MS
    const past = [...priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, tcPrice) : 0
  }, [priceHistory, tcPrice])

  const changeMonth = useMemo(() => {
    const from = Date.now() - 30 * DAY_MS
    const past = [...priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, tcPrice) : 0
  }, [priceHistory, tcPrice])

  const orderBook = useMemo(() => buildOrderBook(tcPrice), [tcPrice])

  /* ---- Market actions ---- */
  const logTrade = useCallback((price: number, amount: number, side: "buy" | "sell", usd: number, kind: TCTransaction["kind"]) => {
    const now = Date.now()
    setTcTrades((prev) => [{ id: `t-${now}`, ts: now, price, amount, side }, ...prev].slice(0, 60))
    setPriceHistory((prev) => [...prev, { ts: now, price }])
    setTcTransactions((prev) => [{ id: `x-${now}`, kind, amountTC: amount, amountUSD: usd, price, ts: now }, ...prev].slice(0, 80))
  }, [])

  const buyTC = useCallback<StoreValue["buyTC"]>(
    (usd) => {
      if (usd <= 0) return { ok: false, message: "Введите сумму" }
      if (cashUSD < usd) return { ok: false, message: "Недостаточно средств ($)" }
      const gross = usd / tcPrice
      const amount = Math.round(gross * (1 - TRADE_FEE) * 100) / 100
      const newPrice = priceAfterTrade(tcPrice, amount, "buy")
      setCashUSD((c) => Math.round((c - usd) * 100) / 100)
      setWallet((w) => ({ ...w, timecoin: w.timecoin + amount }))
      setTcPrice(newPrice)
      logTrade(newPrice, amount, "buy", usd, "buy")
      return { ok: true, message: `Куплено ${amount} ∞ по $${newPrice.toFixed(2)}` }
    },
    [cashUSD, tcPrice, logTrade],
  )

  const sellTC = useCallback<StoreValue["sellTC"]>(
    (tc) => {
      if (tc <= 0) return { ok: false, message: "Введите сумму" }
      if (wallet.timecoin < tc) return { ok: false, message: "Недостаточно TimeCoin" }
      const usd = Math.round(tc * tcPrice * (1 - TRADE_FEE) * 100) / 100
      const newPrice = priceAfterTrade(tcPrice, tc, "sell")
      setWallet((w) => ({ ...w, timecoin: w.timecoin - tc }))
      setCashUSD((c) => Math.round((c + usd) * 100) / 100)
      setTcPrice(newPrice)
      logTrade(newPrice, tc, "sell", usd, "sell")
      return { ok: true, message: `Продано ${tc} ∞ за $${usd.toFixed(2)}` }
    },
    [wallet.timecoin, tcPrice, logTrade],
  )

  const stakeTC = useCallback<StoreValue["stakeTC"]>(
    (amount, days) => {
      const term = STAKE_TERMS.find((t) => t.days === days)
      if (!term) return { ok: false, message: "Неизвестный срок" }
      if (amount < MIN_STAKE) return { ok: false, message: `Минимум ${MIN_STAKE} ∞` }
      if (wallet.timecoin < amount) return { ok: false, message: "Недостаточно TimeCoin" }
      const now = Date.now()
      const stake: Stake = {
        id: `st-${now}`,
        amountTC: amount,
        days,
        apr: term.apr,
        marketFee: term.marketFee,
        startTs: now,
        endTs: now + days * DAY_MS,
        status: "active",
      }
      setWallet((w) => ({ ...w, timecoin: w.timecoin - amount }))
      setStakes((prev) => [stake, ...prev])
      // supply drops → gentle upward pressure
      const newPrice = priceAfterTrade(tcPrice, amount * 0.5, "buy")
      setTcPrice(newPrice)
      setTcTransactions((prev) => [{ id: `x-${now}`, kind: "stake", amountTC: amount, amountUSD: amount * newPrice, price: newPrice, ts: now }, ...prev].slice(0, 80))
      setPriceHistory((prev) => [...prev, { ts: now, price: newPrice }])
      return { ok: true, message: `Застейкано ${amount} ∞ на ${days} дней` }
    },
    [wallet.timecoin, tcPrice],
  )

  const unstakeTC = useCallback<StoreValue["unstakeTC"]>(
    (id) => {
      const stake = stakes.find((s) => s.id === id)
      if (!stake || stake.status === "closed") return { ok: false, message: "Стейк не найден" }
      const now = Date.now()
      const elapsed = Math.min(1, (now - stake.startTs) / (stake.endTs - stake.startTs))
      const reward = Math.round(stake.amountTC * stake.apr * (stake.days / 365) * elapsed * 100) / 100
      const total = stake.amountTC + reward
      setStakes((prev) => prev.map((s) => (s.id === id ? { ...s, status: "closed" } : s)))
      setWallet((w) => ({ ...w, timecoin: w.timecoin + total }))
      const newPrice = priceAfterTrade(tcPrice, stake.amountTC * 0.5, "sell")
      setTcPrice(newPrice)
      setTcTransactions((prev) => [{ id: `x-${now}`, kind: "unstake", amountTC: total, amountUSD: total * newPrice, price: newPrice, ts: now }, ...prev].slice(0, 80))
      setPriceHistory((prev) => [...prev, { ts: now, price: newPrice }])
      return { ok: true, message: `Разблокировано ${total} ∞ (+${reward} награда)` }
    },
    [stakes, tcPrice],
  )

  const recordBurn = useCallback<StoreValue["recordBurn"]>((amount) => {
    if (amount <= 0) return
    const now = Date.now()
    setSessionBurned((b) => b + amount)
    setTcPrice((p) => priceAfterTrade(p, amount * 0.4, "buy"))
    setTcTransactions((prev) => [{ id: `x-${now}`, kind: "burn", amountTC: amount, amountUSD: 0, price: 0, ts: now }, ...prev].slice(0, 80))
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      wallet,
      exchangeUp,
      addTC,
      spendTC,
      spend,
      credit,
      convert,
      netWorthTC,
      usdFor,
      tcPrice,
      priceHistory,
      tcTrades,
      tcTransactions,
      stakes,
      orderBook,
      cashUSD,
      burnedTC,
      stakedTC,
      circulatingTC,
      marketCapUSD,
      volume24hTC,
      change24h,
      changeMonth,
      buyTC,
      sellTC,
      stakeTC,
      unstakeTC,
      recordBurn,
    }),
    [
      wallet,
      exchangeUp,
      addTC,
      spendTC,
      spend,
      credit,
      convert,
      netWorthTC,
      usdFor,
      tcPrice,
      priceHistory,
      tcTrades,
      tcTransactions,
      stakes,
      orderBook,
      cashUSD,
      burnedTC,
      stakedTC,
      circulatingTC,
      marketCapUSD,
      volume24hTC,
      change24h,
      changeMonth,
      buyTC,
      sellTC,
      stakeTC,
      unstakeTC,
      recordBurn,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useOsgard(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error("useOsgard must be used within OsgardStoreProvider")
  return ctx
}
