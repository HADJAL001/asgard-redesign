"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react"
import { CURRENCIES, convertQuote, toCredits, type CurrencyId, type Wallet } from "@/lib/economy"
import {
  DAY_MS,
  STAKE_TERMS,
  pctChange,
  type OrderBook,
  type OrderRow,
  type PricePoint,
  type Stake,
  type TCTrade,
  type TCTransaction,
  type TxKind,
} from "@/lib/tc-market"
import { useOsgardStore, type CurrencyKey } from "@/lib/store/osgard-store"

/* ================================================================
   OSGARD global store — compatibility shim.
   ----------------------------------------------------------------
   Раньше это был отдельный React Context с полностью фейковым,
   ни с чем не связанным состоянием (seed-генераторы, ноль запросов
   к бэкенду). Из-за этого баланс/TC расходились между страницами,
   использующими этот хук, и страницами, использующими настоящий
   Zustand-стор (lib/store/osgard-store.tsx).

   Теперь это тонкая обёртка над useOsgardStore() — единственным
   источником правды. Внешний контракт (useOsgard(), форма
   StoreValue) сохранён без изменений, чтобы не трогать
   файлы-потребители.
   ================================================================ */

const CURRENCY_KEYS: CurrencyId[] = ["credits", "shards", "crystals", "timecoin"]

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
  convert: (wantTo: number, from: CurrencyId, to: CurrencyId) => Promise<ExchangeResult>
  /** Total net worth expressed in TimeCoin. */
  netWorthTC: number
  /** USD value of a TC amount at the live market price. */
  usdFor: (tc: number) => number

  /* ---- TimeCoin market (real backend-driven data) ---- */
  tcPrice: number
  priceHistory: PricePoint[]
  tcTrades: TCTrade[]
  tcTransactions: TCTransaction[]
  stakes: Stake[]
  orderBook: OrderBook
  cashUSD: number
  burnedTC: number
  stakedTC: number
  circulatingTC: number
  marketCapUSD: number
  volume24hTC: number
  change24h: number
  changeMonth: number

  buyTC: (usd: number) => Promise<ExchangeResult>
  sellTC: (tc: number) => Promise<ExchangeResult>
  stakeTC: (amount: number, days: number) => Promise<ExchangeResult>
  unstakeTC: (id: string) => Promise<ExchangeResult>
  recordBurn: (amount: number, note?: string) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function OsgardStoreProvider({ children }: { children: ReactNode }) {
  const real = useOsgardStore()

  useEffect(() => {
    // skipAuthRedirect: это фоновая гидратация при монтировании (на ВСЕХ страницах,
    // включая гостевые/публичные) — гостю с истёкшей/отсутствующей сессией нельзя
    // насильно рвать навигацию редиректом на /login из-за неё.
    const opts = { skipAuthRedirect: true }
    real.fetchWallet(opts)
    real.fetchTcState(opts)
    real.fetchOrderBook(opts)
    real.fetchTrades(opts)
    real.fetchStakes(opts)
    real.fetchTransactions(opts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const wallet = useMemo<Wallet>(
    () => ({
      credits: real.wallet.credits,
      shards: real.wallet.shards,
      crystals: real.wallet.crystals,
      timecoin: real.wallet.timecoin,
    }),
    [real.wallet],
  )

  /** Локальная (без бэкенда) синхронная мутация общего Zustand-кошелька. */
  const localWalletMutate = useCallback((mutator: (w: Wallet) => Wallet) => {
    useOsgardStore.setState((s) => {
      const next = mutator({
        credits: s.wallet.credits,
        shards: s.wallet.shards,
        crystals: s.wallet.crystals,
        timecoin: s.wallet.timecoin,
      })
      return { wallet: { ...s.wallet, ...next } }
    })
  }, [])

  const exchangeUp = useCallback<StoreValue["exchangeUp"]>(
    (from, amount) => {
      const idx = CURRENCY_KEYS.indexOf(from)
      if (idx < 0 || idx >= CURRENCY_KEYS.length - 1) {
        return { ok: false, message: "Нельзя обменять эту валюту вверх" }
      }
      const target = CURRENCY_KEYS[idx + 1]
      const rate = CURRENCIES[target].ratePerLower
      if (amount <= 0 || amount % rate !== 0) {
        return { ok: false, message: `Сумма должна быть кратна ${rate}` }
      }
      let ok = true
      localWalletMutate((w) => {
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
    },
    [localWalletMutate],
  )

  const addTC = useCallback<StoreValue["addTC"]>(
    (amount) => {
      localWalletMutate((w) => ({ ...w, timecoin: w.timecoin + amount }))
    },
    [localWalletMutate],
  )

  const spendTC = useCallback<StoreValue["spendTC"]>(
    (amount) => {
      let ok = true
      localWalletMutate((w) => {
        if (w.timecoin < amount) {
          ok = false
          return w
        }
        return { ...w, timecoin: w.timecoin - amount }
      })
      return ok
    },
    [localWalletMutate],
  )

  const spend = useCallback<StoreValue["spend"]>(
    (currency, amount) => {
      let ok = true
      localWalletMutate((w) => {
        if (w[currency] < amount) {
          ok = false
          return w
        }
        return { ...w, [currency]: w[currency] - amount }
      })
      return ok
    },
    [localWalletMutate],
  )

  const credit = useCallback<StoreValue["credit"]>(
    (currency, amount) => {
      localWalletMutate((w) => ({ ...w, [currency]: w[currency] + amount }))
    },
    [localWalletMutate],
  )

  const convert = useCallback<StoreValue["convert"]>(
    async (wantTo, from, to) => {
      if (from === to) return { ok: false, message: "Выберите разные валюты" }
      if (wantTo <= 0) return { ok: false, message: "Введите сумму" }
      const quote = convertQuote(wantTo, from, to)
      const res = await real.convertCurrency(from as CurrencyKey, to as CurrencyKey, quote.give)
      if (!res.success || !res.conversion) {
        return { ok: false, message: res.error || `Недостаточно ${CURRENCIES[from].label.toLowerCase()}` }
      }
      return {
        ok: true,
        message: `Обмен выполнен: −${res.conversion.amountSent.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${CURRENCIES[from].symbol} → +${res.conversion.amountReceived.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${CURRENCIES[to].symbol}`,
      }
    },
    [real],
  )

  const netWorthTC = useMemo(
    () => CURRENCY_KEYS.reduce((sum, id) => sum + toCredits(wallet[id], id) / CURRENCIES.timecoin.creditRate, 0),
    [wallet],
  )

  const tcPriceNum = real.tcPrice.price
  const usdFor = useCallback<StoreValue["usdFor"]>((tc) => tc * tcPriceNum, [tcPriceNum])

  const burnedTC = real.tcPrice.burned
  const stakedTC = real.tcPrice.staked
  const circulatingTC = real.tcPrice.circulating
  const marketCapUSD = circulatingTC * tcPriceNum

  const volume24hTC = useMemo(() => {
    const from = Date.now() - DAY_MS
    return real.trades.filter((t) => t.ts >= from).reduce((s, t) => s + t.amount, 0)
  }, [real.trades])

  const change24h = useMemo(() => {
    const from = Date.now() - DAY_MS
    const past = [...real.priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, tcPriceNum) : 0
  }, [real.priceHistory, tcPriceNum])

  const changeMonth = useMemo(() => {
    const from = Date.now() - 30 * DAY_MS
    const past = [...real.priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, tcPriceNum) : 0
  }, [real.priceHistory, tcPriceNum])

  const orderBook = useMemo<OrderBook>(() => {
    const withTotal = (levels: { price: number; amount: number }[]): OrderRow[] => {
      let total = 0
      return levels.map((l) => {
        total += l.amount
        return { price: l.price, amount: l.amount, total: Math.round(total * 100) / 100 }
      })
    }
    return {
      bids: withTotal(real.orderBook.bids),
      asks: withTotal(real.orderBook.asks),
      spread: real.orderBook.spread,
      mid: real.orderBook.mid,
    }
  }, [real.orderBook])

  const tcTrades = useMemo<TCTrade[]>(
    () => real.trades.map((t) => ({ id: String(t.id), ts: t.ts, price: t.price, amount: t.amount, side: t.side })),
    [real.trades],
  )

  const stakes = useMemo<Stake[]>(
    () =>
      real.stakes.map((s) => {
        const term = STAKE_TERMS.find((t) => t.days === s.days)
        return {
          id: String(s.id),
          amountTC: s.amountTC,
          days: s.days,
          apr: s.apr,
          marketFee: term?.marketFee ?? 0,
          startTs: s.startTs,
          endTs: s.endTs,
          status: s.status,
        }
      }),
    [real.stakes],
  )

  const tcTransactions = useMemo<TCTransaction[]>(() => {
    const knownKinds: TxKind[] = ["buy", "sell", "burn", "stake", "unstake"]
    return real.transactions.map((t) => ({
      id: String(t.id),
      kind: (knownKinds as string[]).includes(t.type) ? (t.type as TxKind) : "buy",
      amountTC: t.currency === "timecoin" ? t.amount : 0,
      amountUSD: t.currency === "cash_usd" ? t.amount : 0,
      price: tcPriceNum,
      ts: t.createdAt,
    }))
  }, [real.transactions, tcPriceNum])

  const buyTC = useCallback<StoreValue["buyTC"]>(
    async (usd) => {
      if (usd <= 0) return { ok: false, message: "Введите сумму" }
      const res = await real.createMarketBuy(usd)
      if (!res.success || !res.trade) return { ok: false, message: res.error || "Не удалось выполнить покупку" }
      return { ok: true, message: `Куплено ${res.trade.tcAmount} ∞ по $${res.trade.newPrice.toFixed(2)}` }
    },
    [real],
  )

  const sellTC = useCallback<StoreValue["sellTC"]>(
    async (tc) => {
      if (tc <= 0) return { ok: false, message: "Введите сумму" }
      const res = await real.createMarketSell(tc)
      if (!res.success || !res.trade) return { ok: false, message: res.error || "Не удалось выполнить продажу" }
      return { ok: true, message: `Продано ${res.trade.tcAmount} ∞ за $${res.trade.usdAmount.toFixed(2)}` }
    },
    [real],
  )

  const stakeTC = useCallback<StoreValue["stakeTC"]>(
    async (amount, days) => {
      const res = await real.stakeTC(amount, days)
      if (!res.success) return { ok: false, message: res.error || "Не удалось открыть стейк" }
      return { ok: true, message: `Застейкано ${amount} ∞ на ${days} дней` }
    },
    [real],
  )

  const unstakeTC = useCallback<StoreValue["unstakeTC"]>(
    async (id) => {
      const res = await real.unstakeTC(id)
      if (!res.success) return { ok: false, message: res.error || "Не удалось снять стейк" }
      return { ok: true, message: `Разблокировано ${res.totalReturn ?? 0} ∞ (+${res.reward ?? 0} награда)` }
    },
    [real],
  )

  const recordBurn = useCallback<StoreValue["recordBurn"]>(() => {
    /* нет отдельного бэкенд-эндпоинта — сжигание учитывается сервером
       внутри операций (маркет-сделки, премиум-усиление и т.д.) */
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
      tcPrice: tcPriceNum,
      priceHistory: real.priceHistory,
      tcTrades,
      tcTransactions,
      stakes,
      orderBook,
      cashUSD: real.wallet.cash_usd,
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
      tcPriceNum,
      real.priceHistory,
      tcTrades,
      tcTransactions,
      stakes,
      orderBook,
      real.wallet.cash_usd,
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
