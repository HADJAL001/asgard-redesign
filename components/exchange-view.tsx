"use client"

import { useMemo, useState } from "react"
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
} from "recharts"
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowRightLeft, Infinity as InfinityIcon, Boxes } from "lucide-react"
import { Navbar } from "./navbar"
import { TCMarketPanel } from "./tc-market-panel"
import { useOsgard } from "./osgard-store"
import {
  ASSETS,
  CURRENCIES,
  CURRENCY_ORDER,
  RARITY,
  genCandles,
  genOrderBook,
  genTrades,
  creditsTo,
  formatCurrencyAmount,
  type CurrencyId,
  type Rarity,
  type Candle,
} from "@/lib/economy"

const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const ACCENT = "#00D4FF"
const UP = "#4ADE80"
const DOWN = "#F87171"

/* ---------------- Candlestick (custom Recharts shape) ---------------- */

function CandleShape(props: any) {
  const { x, y, width, height, payload } = props
  const { o, c, h, l } = payload as Candle
  if (h === l) return null
  const range = h - l
  const pxPerUnit = height / range
  const bodyTop = y + (h - Math.max(o, c)) * pxPerUnit
  const bodyH = Math.max(1, Math.abs(c - o) * pxPerUnit)
  const color = c >= o ? UP : DOWN
  const cx = x + width / 2
  const bodyW = Math.max(2, width * 0.6)
  return (
    <g>
      <line x1={cx} x2={cx} y1={y} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={1} />
    </g>
  )
}

function ChartTooltip({ active, payload, currency }: Partial<TooltipContentProps<number, string>> & { currency: CurrencyId }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as Candle
  const sym = CURRENCIES[currency].symbol
  const fmt = (v: number) => `${formatCurrencyAmount(currency, creditsTo(v, currency))} ${sym}`
  return (
    <div className="rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}>
      <p className="mb-1 font-medium" style={{ color: "#FFFFFF" }}>
        {d.t}
      </p>
      <p style={{ color: LABEL }}>О: {fmt(d.o)}</p>
      <p style={{ color: LABEL }}>М: {fmt(d.h)}</p>
      <p style={{ color: LABEL }}>Н: {fmt(d.l)}</p>
      <p style={{ color: d.c >= d.o ? UP : DOWN }}>З: {fmt(d.c)}</p>
    </div>
  )
}

export function ExchangeView() {
  const { wallet, spend, credit } = useOsgard()
  const [mode, setMode] = useState<"tc" | "artifacts">("tc")
  const [currency, setCurrency] = useState<CurrencyId>("credits")
  const [assetId, setAssetId] = useState<number>(ASSETS[0]?.id ?? 1)
  const [rarityFilter, setRarityFilter] = useState<Rarity | "all">("all")
  const [side, setSide] = useState<"buy" | "sell">("buy")
  const [orderType, setOrderType] = useState<"limit" | "market">("limit")
  const [priceInput, setPriceInput] = useState<string>("")
  const [qty, setQty] = useState<string>("1")
  const [toast, setToast] = useState<string | null>(null)

  const asset = ASSETS.find((a) => a.id === assetId) ?? ASSETS[0]
  const sym = CURRENCIES[currency].symbol

  const candles = useMemo(() => genCandles(asset.id, asset.last), [asset])
  const book = useMemo(() => genOrderBook(asset.last, asset.id), [asset])
  const trades = useMemo(() => genTrades(asset.last, asset.id), [asset])

  const filteredAssets = ASSETS.filter((a) => rarityFilter === "all" || a.rarity === rarityFilter)

  // convert a credit value to the display currency
  const disp = (credits: number) => creditsTo(credits, currency)
  const fmt = (credits: number) => `${formatCurrencyAmount(currency, disp(credits))} ${sym}`

  const maxBookTotal = Math.max(...book.bids.map((b) => b.total), ...book.asks.map((a) => a.total))

  // order form total (in display currency)
  const priceCredits = orderType === "market" ? asset.last : (Number(priceInput) || 0) * CURRENCIES[currency].creditRate
  const qtyNum = Number(qty) || 0
  const totalCredits = priceCredits * qtyNum
  const totalDisp = disp(totalCredits)

  function submitOrder() {
    if (qtyNum <= 0) {
      setToast("Введите количество")
      return
    }
    if (side === "buy") {
      if (wallet[currency] < totalDisp) {
        setToast(`Недостаточно ${CURRENCIES[currency].label.toLowerCase()}`)
        return
      }
      spend(currency, totalDisp)
      setToast(`Куплено ${qtyNum} × ${asset.ticker} за ${formatCurrencyAmount(currency, totalDisp)} ${sym}`)
    } else {
      credit(currency, totalDisp)
      setToast(`Продано ${qtyNum} × ${asset.ticker} за ${formatCurrencyAmount(currency, totalDisp)} ${sym}`)
    }
    setTimeout(() => setToast(null), 3200)
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[32px] font-semibold leading-tight">
              <TrendingUp size={26} strokeWidth={1.75} style={{ color: ACCENT }} aria-hidden="true" />
              Биржа OSGARD
            </h1>
            <p className="mt-1 text-[15px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {mode === "tc" ? "Рынок TimeCoin · цена формируется реальными сделками" : "Торговый терминал артефактов"}
            </p>
            {/* Market mode toggle */}
            <div className="mt-4 flex items-center gap-1 rounded-full p-1" style={{ border: `1px solid ${BORDER}`, width: "fit-content" }} role="group" aria-label="Режим биржи">
              {([
                { id: "tc" as const, label: "TimeCoin ∞", Icon: InfinityIcon },
                { id: "artifacts" as const, label: "Артефакты", Icon: Boxes },
              ]).map((m) => {
                const active = mode === m.id
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    aria-pressed={active}
                    className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                    style={{ backgroundColor: active ? ACCENT : "transparent", color: active ? "#0A0A0F" : "rgba(255,255,255,0.6)" }}
                  >
                    <m.Icon size={14} strokeWidth={2} aria-hidden="true" />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Display currency selector (artifact terminal only) */}
          {mode === "artifacts" && (
          <div className="flex items-center gap-1 rounded-full p-1" style={{ border: `1px solid ${BORDER}` }} role="group" aria-label="Валюта терминала">
            {CURRENCY_ORDER.map((id) => {
              const c = CURRENCIES[id]
              const CIcon = c.Icon
              const active = currency === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCurrency(id)}
                  aria-pressed={active}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors"
                  style={{ backgroundColor: active ? c.color : "transparent", color: active ? "#0A0A0F" : c.color }}
                >
                  <CIcon size={14} strokeWidth={2} aria-hidden="true" />
                  {c.label}
                </button>
              )
            })}
          </div>
          )}
        </div>

        {mode === "tc" && <TCMarketPanel />}

        {mode === "artifacts" && (
        <>
        {/* Ticker */}
        <div className="mt-6 overflow-hidden rounded-xl" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="flex whitespace-nowrap py-3">
            <div className="osgard-ticker flex shrink-0">
              {[...ASSETS, ...ASSETS].map((a, i) => (
                <span key={i} className="mx-6 inline-flex items-center gap-2 text-[13px]">
                  <span className="font-medium" style={{ color: "#FFFFFF" }}>
                    {a.ticker}
                  </span>
                  <span style={{ color: LABEL }}>{formatCurrencyAmount(currency, creditsTo(a.last, currency))} {sym}</span>
                  <span className="inline-flex items-center gap-0.5" style={{ color: a.change >= 0 ? UP : DOWN }}>
                    {a.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {a.change >= 0 ? "+" : ""}
                    {a.change}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Filters + asset selector */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <FilterChip label="Все" active={rarityFilter === "all"} onClick={() => setRarityFilter("all")} />
          {(["common", "rare", "epic", "legendary", "mythic"] as Rarity[]).map((r) => (
            <FilterChip key={r} label={RARITY[r].label} color={RARITY[r].color} active={rarityFilter === r} onClick={() => setRarityFilter(r)} />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {filteredAssets.map((a) => {
            const active = a.id === asset.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setAssetId(a.id)}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-[13px] transition-colors"
                style={{
                  backgroundColor: active ? "rgba(0,212,255,0.08)" : CARD,
                  border: `1px solid ${active ? ACCENT : BORDER}`,
                }}
              >
                <span className="font-medium" style={{ color: active ? ACCENT : "#FFFFFF" }}>
                  {a.ticker}
                </span>
                <span style={{ color: LABEL }}>{formatCurrencyAmount(currency, creditsTo(a.last, currency))} {sym}</span>
                <span style={{ color: a.change >= 0 ? UP : DOWN }}>
                  {a.change >= 0 ? "+" : ""}
                  {a.change}%
                </span>
              </button>
            )
          })}
        </div>

        {/* Main grid */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Chart */}
          <section className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="График цены">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[16px] font-semibold">
                  {asset.name} <span style={{ color: LABEL }}>· {asset.ticker}</span>
                </p>
                <p className="text-[13px]" style={{ color: LABEL }}>
                  {asset.architect} · {RARITY[asset.rarity].label}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[20px] font-semibold" style={{ color: asset.change >= 0 ? UP : DOWN }}>
                  {fmt(asset.last)}
                </p>
                <p className="text-[13px]" style={{ color: asset.change >= 0 ? UP : DOWN }}>
                  {asset.change >= 0 ? "+" : ""}
                  {asset.change}% · 24ч
                </p>
              </div>
            </div>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={candles.map((c) => ({ ...c, range: [c.l, c.h] }))} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BORDER} vertical={false} />
                  <XAxis dataKey="t" tick={{ fill: LABEL, fontSize: 11 }} axisLine={{ stroke: BORDER }} tickLine={false} interval={3} />
                  <YAxis
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: LABEL, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={60}
                    tickFormatter={(v: number) => formatCurrencyAmount(currency, creditsTo(v, currency))}
                  />
                  <Tooltip content={<ChartTooltip currency={currency} />} cursor={{ stroke: BORDER }} />
                  <Bar dataKey="range" shape={<CandleShape />} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Order book */}
          <section className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="Стакан заявок">
            <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
              <ArrowUpDown size={14} strokeWidth={1.75} aria-hidden="true" />
              Стакан заявок
            </h2>
            <div className="grid grid-cols-3 pb-1 text-[11px] uppercase" style={{ color: LABEL }}>
              <span>Цена</span>
              <span className="text-right">Объём</span>
              <span className="text-right">Всего</span>
            </div>
            {/* Asks (reversed, red) */}
            <div className="flex flex-col-reverse">
              {book.asks.map((r, i) => (
                <BookLine key={"a" + i} row={r} max={maxBookTotal} color={DOWN} fmt={fmt} />
              ))}
            </div>
            <div className="my-2 flex items-center justify-between border-y py-1.5 text-[14px] font-semibold" style={{ borderColor: BORDER, color: asset.change >= 0 ? UP : DOWN }}>
              <span>{fmt(asset.last)}</span>
              <span className="text-[11px]" style={{ color: LABEL }}>Спред</span>
            </div>
            {/* Bids (green) */}
            <div>
              {book.bids.map((r, i) => (
                <BookLine key={"b" + i} row={r} max={maxBookTotal} color={UP} fmt={fmt} />
              ))}
            </div>
          </section>
        </div>

        {/* Bottom row: trades + order form */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Recent trades */}
          <section className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="Последние сделки">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
              Последние сделки
            </h2>
            <div className="grid grid-cols-4 pb-2 text-[11px] uppercase" style={{ color: LABEL }}>
              <span>Время</span>
              <span className="text-right">Цена</span>
              <span className="text-right">Объём</span>
              <span className="text-right">Сторона</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {trades.map((t, i) => (
                <div key={i} className="grid grid-cols-4 text-[13px]">
                  <span style={{ color: LABEL }}>{t.time}</span>
                  <span className="text-right" style={{ color: t.side === "buy" ? UP : DOWN }}>
                    {fmt(t.price)}
                  </span>
                  <span className="text-right" style={{ color: "#FFFFFF" }}>
                    {t.size}
                  </span>
                  <span className="text-right" style={{ color: t.side === "buy" ? UP : DOWN }}>
                    {t.side === "buy" ? "Покупка" : "Продажа"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Order form */}
          <section className="rounded-xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }} aria-label="Выставить заявку">
            <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider" style={{ color: LABEL }}>
              Выставить заявку
            </h2>

            {/* Buy / Sell */}
            <div className="grid grid-cols-2 gap-2">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSide(s)}
                  aria-pressed={side === s}
                  className="rounded-lg py-2 text-[14px] font-medium transition-colors"
                  style={{
                    backgroundColor: side === s ? (s === "buy" ? UP : DOWN) : "transparent",
                    color: side === s ? "#0A0A0F" : s === "buy" ? UP : DOWN,
                    border: `1px solid ${s === "buy" ? UP : DOWN}`,
                  }}
                >
                  {s === "buy" ? "Купить" : "Продать"}
                </button>
              ))}
            </div>

            {/* Limit / Market */}
            <div className="mt-3 flex gap-2">
              {(["limit", "market"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setOrderType(t)}
                  aria-pressed={orderType === t}
                  className="flex-1 rounded-lg py-1.5 text-[12px] font-medium transition-colors"
                  style={{
                    backgroundColor: orderType === t ? "rgba(0,212,255,0.1)" : "transparent",
                    color: orderType === t ? ACCENT : LABEL,
                    border: `1px solid ${orderType === t ? ACCENT : BORDER}`,
                  }}
                >
                  {t === "limit" ? "Лимитная" : "Рыночная"}
                </button>
              ))}
            </div>

            {/* Price */}
            <label className="mt-4 block text-[12px]" style={{ color: LABEL }}>
              Цена ({sym})
              <input
                type="number"
                inputMode="decimal"
                value={orderType === "market" ? "" : priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                disabled={orderType === "market"}
                placeholder={orderType === "market" ? `Рыночная · ${fmt(asset.last)}` : formatCurrencyAmount(currency, disp(asset.last))}
                className="cal-input mt-1 disabled:opacity-50"
              />
            </label>

            {/* Qty */}
            <label className="mt-3 block text-[12px]" style={{ color: LABEL }}>
              Количество
              <input
                type="number"
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="1"
                className="cal-input mt-1"
              />
            </label>

            {/* Currency */}
            <label className="mt-3 block text-[12px]" style={{ color: LABEL }}>
              Валюта
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyId)}
                className="cal-input mt-1"
              >
                {CURRENCY_ORDER.map((id) => (
                  <option key={id} value={id} style={{ backgroundColor: "#0A0A0F" }}>
                    {CURRENCIES[id].label} ({CURRENCIES[id].symbol})
                  </option>
                ))}
              </select>
            </label>

            {/* Total */}
            <div className="mt-4 flex items-center justify-between text-[14px]">
              <span style={{ color: LABEL }}>Итого</span>
              <span className="font-semibold" style={{ color: "#FFFFFF" }}>
                {formatCurrencyAmount(currency, totalDisp)} {sym}
              </span>
            </div>

            <button
              type="button"
              onClick={submitOrder}
              className="mt-4 w-full rounded-lg py-2.5 text-[14px] font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: side === "buy" ? UP : DOWN, color: "#0A0A0F" }}
            >
              {side === "buy" ? "Подтвердить покупку" : "Подтвердить продажу"}
            </button>

            {toast && (
              <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" role="status" style={{ backgroundColor: "rgba(0,212,255,0.08)", color: ACCENT }}>
                {toast}
              </p>
            )}
          </section>
        </div>

        {/* Converter shortcut */}
        <a
          href="/wallet"
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors hover:bg-white/5"
          style={{ border: `1px solid ${BORDER}`, color: ACCENT }}
        >
          <ArrowRightLeft size={16} strokeWidth={1.75} aria-hidden="true" />
          Конвертер валют в кошельке
        </a>
        </>
        )}
      </main>
    </div>
  )
}

function FilterChip({
  label,
  color = "#FFFFFF",
  active,
  onClick,
}: {
  label: string
  color?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors"
      style={{
        backgroundColor: active ? "rgba(0,212,255,0.1)" : "transparent",
        color: active ? ACCENT : color,
        border: `1px solid ${active ? ACCENT : BORDER}`,
      }}
    >
      {label}
    </button>
  )
}

function BookLine({
  row,
  max,
  color,
  fmt,
}: {
  row: { price: number; size: number; total: number }
  max: number
  color: string
  fmt: (credits: number) => string
}) {
  const pct = Math.round((row.total / max) * 100)
  return (
    <div className="relative grid grid-cols-3 py-0.5 text-[12px]">
      <span
        className="absolute inset-y-0 right-0"
        style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.08 }}
        aria-hidden="true"
      />
      <span className="relative" style={{ color }}>
        {fmt(row.price)}
      </span>
      <span className="relative text-right" style={{ color: "#FFFFFF" }}>
        {row.size}
      </span>
      <span className="relative text-right" style={{ color: LABEL }}>
        {row.total}
      </span>
    </div>
  )
}
