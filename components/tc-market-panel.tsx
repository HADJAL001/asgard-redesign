"use client"

/* ================================================================
   TCMarketPanel — панель рынка TimeCoin (TC / USD)
   ----------------------------------------------------------------
   ШАГ 6: полностью переведён на реальные данные бэкенда через
   Zustand-стор useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - Подтягивает состояние рынка (цена/история/капитализация),
     стакан заявок, ленту сделок и заявки текущего пользователя
     из стора при монтировании и обновляет их по таймеру (polling).
   - Строит график цены через candlesFor() (lib/tc-market.ts) на
     основе priceHistory из стора.
   - Отображает реальный стакан (orderBook.bids/asks) и реальные
     сделки (trades).
   - Форма ордера поддерживает переключатель Market / Limit:
     - Market: createMarketBuy(usdAmount) / createMarketSell(tcAmount)
     - Limit:  createLimitOrder(side, price, amount)
   - Блок "Мои заявки": список userOrders со статусами и кнопкой
     отмены открытых/частично исполненных заявок через cancelOrder().
   - Форматирование чисел — через fmtUSD/fmtCompactUSD/fmtTC из
     lib/tc-market.ts.
   - Все статичные тексты переведены через useTranslation() → t('tcMarket.*').
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Infinity as InfinityIcon,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Flame,
  Lock,
  Coins,
  X,
  Loader2,
} from "lucide-react"
import { useOsgardStore } from "@/lib/store/osgard-store"
import {
  UP,
  DOWN,
  TC_ACCENT,
  candlesFor,
  fmtCompactUSD,
  fmtUSD,
  fmtTC,
  pctChange,
  DAY_MS,
  type Timeframe,
} from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const BG_INNER = "#0A0A0F"

/** Интервал опроса бэкенда для «живого» обновления цены/стакана/сделок (мс). */
const POLL_MS = 4000

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
}

export function TCMarketPanel() {
  const { t } = useTranslation()
  const {
    tcPrice,
    priceHistory,
    orderBook,
    trades,
    userOrders,
    wallet,
    loading,
    error,
    fetchTcState,
    fetchOrderBook,
    fetchTrades,
    fetchUserOrders,
    fetchWallet,
    createMarketBuy,
    createMarketSell,
    createLimitOrder,
    cancelOrder,
  } = useOsgardStore()

  const TF_LABELS: Record<Timeframe, string> = {
    day: t("tcMarket.day"),
    week: t("tcMarket.week"),
    month: t("tcMarket.month"),
    year: t("tcMarket.year"),
  }

  const ORDER_STATUS_LABEL: Record<string, string> = {
    open: t("tcMarket.statusOpen"),
    partial: t("tcMarket.statusPartial"),
    filled: t("tcMarket.statusFilled"),
    cancelled: t("tcMarket.statusCancelled"),
  }

  const [tf, setTf] = useState<Timeframe>("month")
  const [orderKind, setOrderKind] = useState<"market" | "limit">("market")
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState<string>("")
  const [limitPrice, setLimitPrice] = useState<string>("")
  const [submitting, setSubmitting] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  /* "Текущее время" для окон 24ч/30д — снимается на монтировании и обновляется
     тем же интервалом, что и остальные рыночные данные (см. эффект polling'а
     ниже), вместо прямого Date.now() в рендере/useMemo (react-hooks/purity). */
  const [now, setNow] = useState(() => Date.now())

  /* ---- начальная загрузка + polling ----
     skipAuthRedirect: транзитная ошибка (сеть/холодный старт) во время фонового
     опроса не должна кидать пользователя на /login — он же не нажимал "Выйти". */
  useEffect(() => {
    const opts = { skipAuthRedirect: true }
    fetchTcState(opts)
    fetchOrderBook(opts)
    fetchTrades(opts)
    fetchUserOrders(opts)
    fetchWallet(opts)

    const id = setInterval(() => {
      fetchTcState(opts)
      fetchOrderBook(opts)
      fetchTrades(opts)
      setNow(Date.now())
    }, POLL_MS)

    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const price = tcPrice.price
  const candles = useMemo(() => candlesFor(priceHistory, tf), [priceHistory, tf])
  const chartData = candles.map((c) => ({ label: c.label, price: c.c }))

  const change24h = useMemo(() => {
    const from = now - DAY_MS
    const past = [...priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, price) : 0
  }, [priceHistory, price, now])
  const up24 = change24h >= 0

  const changeMonth = useMemo(() => {
    const from = now - 30 * DAY_MS
    const past = [...priceHistory].reverse().find((p) => p.ts <= from)
    return past ? pctChange(past.price, price) : 0
  }, [priceHistory, price, now])

  const volume24hTC = useMemo(() => {
    const from = now - DAY_MS
    return trades.filter((t) => t.ts >= from).reduce((s, t) => s + t.amount, 0)
  }, [trades, now])

  const marketCapUSD = tcPrice.circulating * price

  const maxTotal = useMemo(() => {
    const bidTotals = orderBook.bids.reduce<number[]>((acc, b) => {
      const prev = acc.length > 0 ? acc[acc.length - 1] : 0
      return [...acc, prev + b.amount]
    }, [])
    const askTotals = orderBook.asks.reduce<number[]>((acc, a) => {
      const prev = acc.length > 0 ? acc[acc.length - 1] : 0
      return [...acc, prev + a.amount]
    }, [])
    return Math.max(...bidTotals, ...askTotals, 1)
  }, [orderBook])

  // накопленные total для стакана (бэкенд отдаёт только price/amount на уровень)
  const bidRows = useMemo(
    () =>
      orderBook.bids.reduce<Array<(typeof orderBook.bids)[number] & { total: number }>>((acc, b) => {
        const prevTotal = acc.length > 0 ? acc[acc.length - 1].total : 0
        return [...acc, { ...b, total: prevTotal + b.amount }]
      }, []),
    [orderBook],
  )

  const askRows = useMemo(
    () =>
      orderBook.asks.reduce<Array<(typeof orderBook.asks)[number] & { total: number }>>((acc, a) => {
        const prevTotal = acc.length > 0 ? acc[acc.length - 1].total : 0
        return [...acc, { ...a, total: prevTotal + a.amount }]
      }, []),
    [orderBook],
  )

  const amountNum = Number(amount) || 0
  const limitPriceNum = Number(limitPrice) || 0

  const openOrders = userOrders.filter((o) => o.status === "open" || o.status === "partial")

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 3600)
  }

  async function submit() {
    if (amountNum <= 0) return
    if (orderKind === "limit" && limitPriceNum <= 0) {
      showToast(false, t("tcMarket.specifyLimitPrice"))
      return
    }

    setSubmitting(true)
    try {
      if (orderKind === "market") {
        const res =
          side === "buy" ? await createMarketBuy(amountNum) : await createMarketSell(amountNum)
        if (res.success && res.trade) {
          showToast(
            true,
            side === "buy"
              ? t("tcMarket.bought", { amount: fmtTC(res.trade.tcAmount), price: fmtUSD(res.trade.price) })
              : t("tcMarket.sold", { amount: fmtTC(res.trade.tcAmount), amount2: fmtUSD(res.trade.usdAmount) }),
          )
          setAmount("")
        } else {
          showToast(false, res.error || t("tcMarket.operationFailed"))
        }
      } else {
        const res = await createLimitOrder(side, limitPriceNum, amountNum)
        if (res.success) {
          showToast(true, side === "buy" ? t("tcMarket.limitBuyPlaced") : t("tcMarket.limitSellPlaced"))
          setAmount("")
          setLimitPrice("")
          fetchUserOrders()
        } else {
          showToast(false, res.error || t("tcMarket.orderFailed"))
        }
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(orderId: number) {
    const res = await cancelOrder(orderId)
    showToast(res.success, res.success ? t("tcMarket.orderCancelled") : res.error || t("tcMarket.orderCancelFailed"))
    if (res.success) fetchUserOrders()
  }

  return (
    <div>
      {/* Price header */}
      <section
        className="rounded-2xl p-6"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[13px]" style={{ color: LABEL }}>
              <InfinityIcon size={16} strokeWidth={2} style={{ color: TC_ACCENT }} aria-hidden="true" />
              {t("tcMarket.priceHeader")}
            </div>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-[40px] font-semibold leading-none tabular-nums">
                {fmtUSD(price)}
              </span>
              <span
                className="mb-1 inline-flex items-center gap-1 text-[15px] font-medium"
                style={{ color: up24 ? UP : DOWN }}
              >
                {up24 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {t("tcMarket.todayChange", { sign: up24 ? "+" : "", value: change24h.toFixed(2) })}
              </span>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: changeMonth >= 0 ? UP : DOWN }}>
              {t("tcMarket.monthChange", { sign: changeMonth >= 0 ? "+" : "", value: changeMonth.toFixed(1) })}
            </p>
          </div>

          <div className="flex gap-3">
            <BalanceChip Icon={DollarSign} label={t("tcMarket.cash")} value={fmtUSD(wallet.cash_usd)} color={UP} />
            <BalanceChip Icon={InfinityIcon} label={t("tcMarket.timecoin")} value={fmtTC(wallet.timecoin)} color={TC_ACCENT} />
          </div>
        </div>

        {/* Timeframe toggle */}
        <div className="mt-5 flex items-center gap-1.5">
          {(Object.keys(TF_LABELS) as Timeframe[]).map((tfKey) => (
            <button
              key={tfKey}
              type="button"
              onClick={() => setTf(tfKey)}
              aria-pressed={tf === tfKey}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: tf === tfKey ? "rgba(0,212,255,0.12)" : "transparent",
                color: tf === tfKey ? TC_ACCENT : LABEL,
                border: `1px solid ${tf === tfKey ? TC_ACCENT : BORDER}`,
              }}
            >
              {TF_LABELS[tfKey]}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="mt-4 h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="tcArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={up24 ? UP : DOWN} stopOpacity={0.32} />
                  <stop offset="100%" stopColor={up24 ? UP : DOWN} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: LABEL, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} minTickGap={24} />
              <YAxis
                domain={["auto", "auto"]}
                tick={{ fill: LABEL, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={54}
                tickFormatter={(v: number) => `$${v.toFixed(v < 10 ? 1 : 0)}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: BG_INNER, border: `1px solid ${BORDER}`, borderRadius: 8, color: "#fff", fontSize: 12 }}
                formatter={(v: unknown) => [fmtUSD(Number(v) || 0), t("tcMarket.priceCol")]}
              />
              <Area type="monotone" dataKey="price" stroke={up24 ? UP : DOWN} strokeWidth={2} fill="url(#tcArea)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Stats strip */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
        <Stat Icon={TrendingUp} label={t("tcMarket.volume24h")} value={fmtTC(volume24hTC)} sub={fmtCompactUSD(volume24hTC * price)} color={TC_ACCENT} />
        <Stat Icon={Coins} label={t("tcMarket.marketCap")} value={fmtCompactUSD(marketCapUSD)} color={UP} />
        <Stat Icon={InfinityIcon} label={t("tcMarket.circulating")} value={fmtTC(tcPrice.circulating)} color="#fff" />
        <Stat Icon={Flame} label={t("tcMarket.burned")} value={fmtTC(tcPrice.burned)} color={DOWN} />
        <Stat Icon={Lock} label={t("tcMarket.staked")} value={fmtTC(tcPrice.staked)} color="#FBBF24" />
      </div>

      {/* Order book + order form */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Order book */}
        <section className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label={t("tcMarket.orderBookTitle")}>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
            {t("tcMarket.orderBookTitle")}
          </h2>
          <div className="grid grid-cols-3 pb-1 text-[11px] uppercase" style={{ color: LABEL }}>
            <span>{t("tcMarket.priceCol")}</span>
            <span className="text-right">{t("tcMarket.volumeCol")}</span>
            <span className="text-right">{t("tcMarket.totalCol")}</span>
          </div>
          <div className="flex flex-col-reverse">
            {askRows.map((r, i) => (
              <BookLine key={"a" + i} price={r.price} amount={r.amount} total={r.total} max={maxTotal} color={DOWN} />
            ))}
            {askRows.length === 0 && <EmptyRow label={t("tcMarket.noAsks")} />}
          </div>
          <div className="my-2 flex items-center justify-between border-y py-2 text-[15px] font-semibold" style={{ borderColor: BORDER, color: up24 ? UP : DOWN }}>
            <span>{fmtUSD(price)}</span>
            <span className="text-[11px]" style={{ color: LABEL }}>{t("tcMarket.spread", { amount: fmtUSD(orderBook.spread) })}</span>
          </div>
          <div>
            {bidRows.map((r, i) => (
              <BookLine key={"b" + i} price={r.price} amount={r.amount} total={r.total} max={maxTotal} color={UP} />
            ))}
            {bidRows.length === 0 && <EmptyRow label={t("tcMarket.noBids")} />}
          </div>
        </section>

        {/* Order form */}
        <section className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label={t("tcMarket.buyTitle")}>
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
            {side === "buy" ? t("tcMarket.buyTitle") : t("tcMarket.sellTitle")}
          </h2>

          {/* Buy / Sell */}
          <div className="grid grid-cols-2 gap-2">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setSide(s); setAmount(""); setToast(null) }}
                aria-pressed={side === s}
                className="rounded-lg py-2 text-[14px] font-medium transition-colors"
                style={{
                  backgroundColor: side === s ? (s === "buy" ? UP : DOWN) : "transparent",
                  color: side === s ? BG_INNER : s === "buy" ? UP : DOWN,
                  border: `1px solid ${s === "buy" ? UP : DOWN}`,
                }}
              >
                {s === "buy" ? t("tcMarket.buy") : t("tcMarket.sell")}
              </button>
            ))}
          </div>

          {/* Market / Limit toggle */}
          <div className="mt-2 flex gap-2">
            {(["market", "limit"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOrderKind(k)}
                aria-pressed={orderKind === k}
                className="flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors"
                style={{
                  backgroundColor: orderKind === k ? "rgba(0,212,255,0.1)" : "transparent",
                  color: orderKind === k ? TC_ACCENT : LABEL,
                  border: `1px solid ${orderKind === k ? TC_ACCENT : BORDER}`,
                }}
              >
                {k === "market" ? t("tcMarket.market") : t("tcMarket.limit")}
              </button>
            ))}
          </div>

          {orderKind === "limit" && (
            <label className="mt-4 block text-[12px]" style={{ color: LABEL }}>
              {t("tcMarket.orderPrice")}
              <input
                type="number"
                inputMode="decimal"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={price.toFixed(2)}
                className="cal-input mt-1"
              />
            </label>
          )}

          <label className="mt-4 block text-[12px]" style={{ color: LABEL }}>
            {orderKind === "market"
              ? side === "buy"
                ? t("tcMarket.usdAmount")
                : t("tcMarket.tcAmount")
              : t("tcMarket.tcAmount")}
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={orderKind === "market" ? (side === "buy" ? "100" : "10") : "10"}
              className="cal-input mt-1"
            />
          </label>

          {/* Quick fills */}
          <div className="mt-2 flex gap-1.5">
            {(orderKind === "market" && side === "buy" ? [50, 100, 250, 500] : [10, 50, 100]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="flex-1 rounded-md py-1 text-[11px] transition-colors hover:opacity-80"
                style={{ border: `1px solid ${BORDER}`, color: LABEL }}
              >
                {orderKind === "market" && side === "buy" ? `$${v}` : `${v} ∞`}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 text-[13px]">
            <Row label={t("tcMarket.marketPrice")} value={fmtUSD(price)} />
            {orderKind === "limit" && (
              <Row label={t("tcMarket.orderPriceLabel")} value={limitPriceNum > 0 ? fmtUSD(limitPriceNum) : "—"} muted />
            )}
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={amountNum <= 0 || submitting || loading}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: side === "buy" ? UP : DOWN, color: BG_INNER }}
          >
            {(submitting || loading) && <Loader2 size={16} className="animate-spin" />}
            {orderKind === "market"
              ? side === "buy"
                ? t("tcMarket.buyTimeCoin")
                : t("tcMarket.sellTimeCoin")
              : side === "buy"
                ? t("tcMarket.placeLimitBuy")
                : t("tcMarket.placeLimitSell")}
          </button>

          {toast && (
            <p
              className="mt-3 rounded-lg px-3 py-2 text-[12px]"
              role="status"
              style={{
                backgroundColor: toast.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
                color: toast.ok ? UP : DOWN,
              }}
            >
              {toast.msg}
            </p>
          )}

          {error && !toast && (
            <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" role="status" style={{ backgroundColor: "rgba(239,68,68,0.1)", color: DOWN }}>
              {error}
            </p>
          )}
        </section>
      </div>

      {/* My orders */}
      <section className="mt-6 rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label={t("tcMarket.myOrders")}>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
          {t("tcMarket.myOrders")}
        </h2>
        {userOrders.length === 0 ? (
          <p className="text-[13px]" style={{ color: LABEL }}>{t("tcMarket.noOrders")}</p>
        ) : (
          <>
            <div className="grid grid-cols-6 gap-2 pb-2 text-[11px] uppercase" style={{ color: LABEL }}>
              <span>{t("tcMarket.colSide")}</span>
              <span className="text-right">{t("tcMarket.priceCol")}</span>
              <span className="text-right">{t("tcMarket.volumeCol")}</span>
              <span className="text-right">{t("tcMarket.colFilled")}</span>
              <span className="text-right">{t("tcMarket.colStatusOrder")}</span>
              <span className="text-right">{t("tcMarket.colAction")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {userOrders.map((o) => {
                const cancellable = o.status === "open" || o.status === "partial"
                return (
                  <div key={o.id} className="grid grid-cols-6 items-center gap-2 text-[13px] tabular-nums">
                    <span style={{ color: o.side === "buy" ? UP : DOWN }}>{o.side === "buy" ? t("tcMarket.buy") : t("tcMarket.sell")}</span>
                    <span className="text-right" style={{ color: "#fff" }}>{fmtUSD(o.price)}</span>
                    <span className="text-right" style={{ color: "#fff" }}>{o.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span>
                    <span className="text-right" style={{ color: LABEL }}>{o.filledAmount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span>
                    <span className="text-right" style={{ color: LABEL }}>{ORDER_STATUS_LABEL[o.status] ?? o.status}</span>
                    <span className="text-right">
                      {cancellable ? (
                        <button
                          type="button"
                          onClick={() => handleCancel(o.id)}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors hover:opacity-80"
                          style={{ border: `1px solid ${DOWN}`, color: DOWN }}
                        >
                          <X size={12} strokeWidth={2} />
                          {t("tcMarket.cancelOrder")}
                        </button>
                      ) : (
                        <span style={{ color: LABEL }}>—</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {openOrders.length > 0 && (
          <p className="mt-3 text-[11px]" style={{ color: LABEL }}>
            {t("tcMarket.openOrdersCount", { count: openOrders.length })}
          </p>
        )}
      </section>

      {/* Recent trades */}
      <section className="mt-6 rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label={t("tcMarket.recentTrades")}>
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
          {t("tcMarket.recentTrades")}
        </h2>
        <div className="grid grid-cols-4 pb-2 text-[11px] uppercase" style={{ color: LABEL }}>
          <span>{t("tcMarket.colTime")}</span>
          <span className="text-right">{t("tcMarket.priceCol")}</span>
          <span className="text-right">{t("tcMarket.volumeCol")}</span>
          <span className="text-right">{t("tcMarket.colSide")}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {trades.slice(0, 14).map((tr) => (
            <div key={tr.id} className="grid grid-cols-4 text-[13px] tabular-nums">
              <span style={{ color: LABEL }}>{fmtTime(tr.ts)}</span>
              <span className="text-right" style={{ color: tr.side === "buy" ? UP : DOWN }}>{fmtUSD(tr.price)}</span>
              <span className="text-right" style={{ color: "#fff" }}>{tr.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span>
              <span className="text-right" style={{ color: tr.side === "buy" ? UP : DOWN }}>{tr.side === "buy" ? t("tcMarket.buy") : t("tcMarket.sell")}</span>
            </div>
          ))}
          {trades.length === 0 && <EmptyRow label={t("tcMarket.noTrades")} />}
        </div>
      </section>
    </div>
  )
}

function BalanceChip({ Icon, label, value, color }: { Icon: typeof InfinityIcon; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl px-4 py-2.5" style={{ backgroundColor: BG_INNER, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: LABEL }}>
        <Icon size={13} strokeWidth={1.75} style={{ color }} aria-hidden="true" />
        {label}
      </div>
      <p className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</p>
    </div>
  )
}

function Stat({ Icon, label, value, sub, color }: { Icon: typeof InfinityIcon; label: string; value: string; sub?: string; color: string }) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <Icon size={16} strokeWidth={1.5} style={{ color }} aria-hidden="true" />
      <p className="mt-2 text-[16px] font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-1.5 text-[11px]" style={{ color: LABEL }}>{label}{sub ? ` · ${sub}` : ""}</p>
    </div>
  )
}

function BookLine({ price, amount, total, max, color }: { price: number; amount: number; total: number; max: number; color: string }) {
  const pct = Math.min(100, (total / max) * 100)
  return (
    <div className="relative grid grid-cols-3 py-0.5 text-[12px] tabular-nums">
      <span className="absolute inset-y-0 right-0" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.08 }} aria-hidden="true" />
      <span className="relative z-10" style={{ color }}>{fmtUSD(price)}</span>
      <span className="relative z-10 text-right" style={{ color: "#fff" }}>{amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span>
      <span className="relative z-10 text-right" style={{ color: LABEL }}>{total.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}</span>
    </div>
  )
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="py-2 text-center text-[12px]" style={{ color: LABEL }}>
      {label}
    </div>
  )
}

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: LABEL }}>{label}</span>
      <span className={strong ? "font-semibold" : ""} style={{ color: muted ? LABEL : "#fff" }}>{value}</span>
    </div>
  )
}
