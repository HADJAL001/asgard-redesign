"use client"

import { useMemo, useState } from "react"
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
  Wallet as WalletIcon,
  DollarSign,
  Flame,
  Lock,
  Coins,
} from "lucide-react"
import { useOsgard } from "./osgard-store"
import {
  UP,
  DOWN,
  TC_ACCENT,
  TRADE_FEE,
  candlesFor,
  fmtCompactUSD,
  fmtUSD,
  type Timeframe,
} from "@/lib/tc-market"

const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const BG_INNER = "#0A0A0F"

const TF_LABELS: Record<Timeframe, string> = { day: "День", week: "Неделя", month: "Месяц", year: "Год" }

function fmtTime(ts: number) {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`
}

export function TCMarketPanel() {
  const {
    tcPrice,
    priceHistory,
    orderBook,
    tcTrades,
    change24h,
    changeMonth,
    volume24hTC,
    marketCapUSD,
    circulatingTC,
    burnedTC,
    stakedTC,
    cashUSD,
    wallet,
    buyTC,
    sellTC,
  } = useOsgard()

  const [tf, setTf] = useState<Timeframe>("month")
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState<string>("")
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)

  const candles = useMemo(() => candlesFor(priceHistory, tf), [priceHistory, tf])
  const chartData = candles.map((c) => ({ label: c.label, price: c.c }))
  const up24 = change24h >= 0

  const maxTotal = Math.max(
    ...orderBook.bids.map((b) => b.total),
    ...orderBook.asks.map((a) => a.total),
    1,
  )

  const amountNum = Number(amount) || 0
  const fee = TRADE_FEE
  // buy: input is USD → receive TC; sell: input is TC → receive USD
  const estReceive =
    side === "buy" ? (amountNum / tcPrice) * (1 - fee) : amountNum * tcPrice * (1 - fee)
  const feeCost = side === "buy" ? amountNum * fee : amountNum * tcPrice * fee

  function submit() {
    const res = side === "buy" ? buyTC(amountNum) : sellTC(amountNum)
    setToast({ ok: res.ok, msg: res.message })
    if (res.ok) setAmount("")
    setTimeout(() => setToast(null), 3600)
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
              TimeCoin · TC / USD
            </div>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-[40px] font-semibold leading-none tabular-nums">
                {fmtUSD(tcPrice)}
              </span>
              <span
                className="mb-1 inline-flex items-center gap-1 text-[15px] font-medium"
                style={{ color: up24 ? UP : DOWN }}
              >
                {up24 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                {up24 ? "+" : ""}
                {change24h.toFixed(2)}% · 24ч
              </span>
            </div>
            <p className="mt-1 text-[13px]" style={{ color: changeMonth >= 0 ? UP : DOWN }}>
              {changeMonth >= 0 ? "+" : ""}
              {changeMonth.toFixed(1)}% за 30 дней · цена по последней сделке
            </p>
          </div>

          <div className="flex gap-3">
            <BalanceChip Icon={DollarSign} label="Наличные" value={fmtUSD(cashUSD)} color={UP} />
            <BalanceChip Icon={InfinityIcon} label="TimeCoin" value={`${wallet.timecoin.toLocaleString("ru-RU")} ∞`} color={TC_ACCENT} />
          </div>
        </div>

        {/* Timeframe toggle */}
        <div className="mt-5 flex items-center gap-1.5">
          {(Object.keys(TF_LABELS) as Timeframe[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              aria-pressed={tf === t}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
              style={{
                backgroundColor: tf === t ? "rgba(0,212,255,0.12)" : "transparent",
                color: tf === t ? TC_ACCENT : LABEL,
                border: `1px solid ${tf === t ? TC_ACCENT : BORDER}`,
              }}
            >
              {TF_LABELS[t]}
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
                formatter={(v: number) => [fmtUSD(v), "Цена TC"]}
              />
              <Area type="monotone" dataKey="price" stroke={up24 ? UP : DOWN} strokeWidth={2} fill="url(#tcArea)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Stats strip */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
        <Stat Icon={TrendingUp} label="Объём 24ч" value={`${Math.round(volume24hTC).toLocaleString("ru-RU")} ∞`} sub={fmtCompactUSD(volume24hTC * tcPrice)} color={TC_ACCENT} />
        <Stat Icon={Coins} label="Капитализация" value={fmtCompactUSD(marketCapUSD)} color={UP} />
        <Stat Icon={InfinityIcon} label="В обороте" value={`${Math.round(circulatingTC).toLocaleString("ru-RU")} ∞`} color="#fff" />
        <Stat Icon={Flame} label="Сожжено" value={`${Math.round(burnedTC).toLocaleString("ru-RU")} ∞`} color={DOWN} />
        <Stat Icon={Lock} label="Застейкано" value={`${Math.round(stakedTC).toLocaleString("ru-RU")} ∞`} color="#FBBF24" />
      </div>

      {/* Order book + order form */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_340px]">
        {/* Order book */}
        <section className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="Стакан заявок TC">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
            Стакан заявок · TC / USD
          </h2>
          <div className="grid grid-cols-3 pb-1 text-[11px] uppercase" style={{ color: LABEL }}>
            <span>Цена ($)</span>
            <span className="text-right">Объём (∞)</span>
            <span className="text-right">Всего</span>
          </div>
          <div className="flex flex-col-reverse">
            {orderBook.asks.map((r, i) => (
              <BookLine key={"a" + i} price={r.price} amount={r.amount} total={r.total} max={maxTotal} color={DOWN} />
            ))}
          </div>
          <div className="my-2 flex items-center justify-between border-y py-2 text-[15px] font-semibold" style={{ borderColor: BORDER, color: up24 ? UP : DOWN }}>
            <span>{fmtUSD(tcPrice)}</span>
            <span className="text-[11px]" style={{ color: LABEL }}>Спред {fmtUSD(orderBook.spread)}</span>
          </div>
          <div>
            {orderBook.bids.map((r, i) => (
              <BookLine key={"b" + i} price={r.price} amount={r.amount} total={r.total} max={maxTotal} color={UP} />
            ))}
          </div>
        </section>

        {/* Order form */}
        <section className="rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="Купить или продать TimeCoin">
          <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
            {side === "buy" ? "Купить TimeCoin" : "Продать TimeCoin"}
          </h2>
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
                {s === "buy" ? "Купить" : "Продать"}
              </button>
            ))}
          </div>

          <label className="mt-4 block text-[12px]" style={{ color: LABEL }}>
            {side === "buy" ? "Сумма в долларах ($)" : "Количество TC (∞)"}
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={side === "buy" ? "100" : "10"}
              className="cal-input mt-1"
            />
          </label>

          {/* Quick fills */}
          <div className="mt-2 flex gap-1.5">
            {(side === "buy" ? [50, 100, 250, 500] : [10, 50, 100]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="flex-1 rounded-md py-1 text-[11px] transition-colors hover:opacity-80"
                style={{ border: `1px solid ${BORDER}`, color: LABEL }}
              >
                {side === "buy" ? `$${v}` : `${v} ∞`}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 text-[13px]">
            <Row label="Цена" value={fmtUSD(tcPrice)} />
            <Row label={`Комиссия ${(fee * 100).toFixed(1)}%`} value={side === "buy" ? fmtUSD(feeCost) : `${feeCost.toFixed(3)} ∞`} muted />
            <Row
              label={side === "buy" ? "Получите" : "Получите"}
              value={side === "buy" ? `${estReceive.toFixed(3)} ∞` : fmtUSD(estReceive)}
              strong
            />
          </div>

          <button
            type="button"
            onClick={submit}
            disabled={amountNum <= 0}
            className="mt-4 w-full rounded-lg py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: side === "buy" ? UP : DOWN, color: BG_INNER }}
          >
            {side === "buy" ? "Купить TimeCoin" : "Продать TimeCoin"}
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
        </section>
      </div>

      {/* Recent trades */}
      <section className="mt-6 rounded-2xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="Последние сделки TC">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
          Последние сделки
        </h2>
        <div className="grid grid-cols-4 pb-2 text-[11px] uppercase" style={{ color: LABEL }}>
          <span>Время</span>
          <span className="text-right">Цена ($)</span>
          <span className="text-right">Объём (∞)</span>
          <span className="text-right">Сторона</span>
        </div>
        <div className="flex flex-col gap-1.5">
          {tcTrades.slice(0, 14).map((t) => (
            <div key={t.id} className="grid grid-cols-4 text-[13px] tabular-nums">
              <span style={{ color: LABEL }}>{fmtTime(t.ts)}</span>
              <span className="text-right" style={{ color: t.side === "buy" ? UP : DOWN }}>{fmtUSD(t.price)}</span>
              <span className="text-right" style={{ color: "#fff" }}>{t.amount.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}</span>
              <span className="text-right" style={{ color: t.side === "buy" ? UP : DOWN }}>{t.side === "buy" ? "Покупка" : "Продажа"}</span>
            </div>
          ))}
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

function Row({ label, value, muted, strong }: { label: string; value: string; muted?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: LABEL }}>{label}</span>
      <span className={strong ? "font-semibold" : ""} style={{ color: muted ? LABEL : "#fff" }}>{value}</span>
    </div>
  )
}
