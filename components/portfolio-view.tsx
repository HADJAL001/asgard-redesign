"use client"

import { useMemo, useState } from "react"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Wallet,
  Building2,
  TrendingUp,
  Coins,
  Gem,
  RefreshCw,
  ArrowDownRight,
  ArrowUpRight,
  Gift,
  Check,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E
   up #10B981 · down #EF4444 · dividend #F59E0B */
const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const UP = "#10B981"
const DOWN = "#EF4444"
const DIVIDEND = "#F59E0B"

type Range = "day" | "week" | "month" | "year"

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
]

const METRICS: { label: string; value: string; Icon: LucideIcon; accent?: string }[] = [
  { label: "Баланс", value: "7 340", Icon: Wallet },
  { label: "Акции", value: "2 450", Icon: Building2 },
  { label: "Рост", value: "+18%", Icon: TrendingUp, accent: UP },
  { label: "Дивиденды", value: "340", Icon: Gift, accent: DIVIDEND },
]

const TOKENS = [
  { name: "Neural", amount: 340, price: "12.50 USDT", change: 5.2 },
  { name: "Creative", amount: 120, price: "8.20 USDT", change: 2.4 },
  { name: "Core", amount: 80, price: "24.90 USDT", change: -1.8 },
  { name: "Legacy", amount: 50, price: "5.10 USDT", change: 0.6 },
]

const STOCKS = [
  { name: "OSGARD Corp", amount: 12, price: "104.30 USDT", change: 3.1 },
  { name: "AI Tech", amount: 8, price: "76.80 USDT", change: 1.9 },
  { name: "MetaVerse", amount: 5, price: "42.15 USDT", change: -0.7 },
]

type TxType = "buy" | "sell" | "dividend"
const TX: { date: string; type: TxType; amount: string; token: string }[] = [
  { date: "12.07", type: "buy", amount: "+340", token: "Neural" },
  { date: "11.07", type: "sell", amount: "-120", token: "Creative" },
  { date: "10.07", type: "dividend", amount: "+50", token: "Core" },
  { date: "09.07", type: "buy", amount: "+80", token: "Legacy" },
  { date: "08.07", type: "sell", amount: "-30", token: "Neural" },
]

const TX_META: Record<TxType, { label: string; color: string; Icon: LucideIcon }> = {
  buy: { label: "Покупка", color: UP, Icon: ArrowUpRight },
  sell: { label: "Продажа", color: DOWN, Icon: ArrowDownRight },
  dividend: { label: "Дивиденды", color: DIVIDEND, Icon: Gift },
}

/* deterministic pseudo-random so SSR matches client */
function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function buildPortfolio(range: Range) {
  const config: Record<Range, { labels: string[]; base: number; seed: number }> = {
    day: { labels: ["00", "04", "08", "12", "16", "20", "24"], base: 7100, seed: 17 },
    week: { labels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], base: 6900, seed: 31 },
    month: { labels: ["01.07", "08.07", "15.07", "22.07", "29.07"], base: 6400, seed: 59 },
    year: { labels: ["Янв", "Мар", "Май", "Июл", "Сен", "Ноя"], base: 4200, seed: 83 },
  }
  const c = config[range]
  const rnd = seeded(c.seed)
  return c.labels.map((label, i) => ({
    label,
    value: Math.round(c.base + c.base * 0.05 * rnd() + i * (c.base * 0.03)),
  }))
}

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-md px-3 py-1.5 font-sans text-[12px]"
      style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
    >
      {Number(payload[0].value).toLocaleString("ru-RU")} USDT
    </div>
  )
}

export function PortfolioView() {
  const [range, setRange] = useState<Range>("month")
  const data = useMemo(() => buildPortfolio(range), [range])

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        {/* Title */}
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Портфель</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Управление токенами и инвестициями
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
            style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.8)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = ACCENT
              e.currentTarget.style.color = ACCENT
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = BORDER
              e.currentTarget.style.color = "rgba(255,255,255,0.8)"
            }}
          >
            <RefreshCw size={16} strokeWidth={1.75} />
            Обновить
          </button>
        </header>

        {/* Metrics */}
        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-5 transition-colors"
              style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: LABEL }}>
                  {m.label}
                </span>
                <m.Icon size={16} strokeWidth={1.75} style={{ color: m.accent ?? LABEL }} />
              </div>
              <p className="mt-3 text-[24px] font-medium" style={{ color: m.accent ?? "#FFFFFF" }}>
                {m.value}
              </p>
            </div>
          ))}
        </section>

        {/* Time filters */}
        <div className="mb-6 flex items-center gap-6 border-b" style={{ borderColor: BORDER }}>
          {RANGES.map((r) => {
            const active = r.id === range
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className="relative pb-3 text-[13px] uppercase tracking-wide transition-colors"
                style={{ color: active ? ACCENT : "rgba(255,255,255,0.5)" }}
              >
                {r.label}
                {active && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-0.5"
                    style={{ backgroundColor: ACCENT }}
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Portfolio chart */}
        <section
          className="mb-8 rounded-xl p-5"
          style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        >
          <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
            График портфеля
          </h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={BORDER} vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={{ stroke: BORDER }}
                  tick={{ fill: LABEL, fontSize: 12 }}
                  dy={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: LABEL, fontSize: 12 }}
                  width={56}
                  tickFormatter={(v) => Number(v).toLocaleString("ru-RU")}
                />
                <Tooltip content={<ChartTip />} cursor={{ stroke: BORDER }} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={ACCENT}
                  strokeWidth={2}
                  dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: ACCENT, strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Tokens + Stocks */}
        <section className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <HoldingsCard title="Токены" Icon={Gem} items={TOKENS} unit="" />
          <HoldingsCard title="Акции" Icon={Building2} items={STOCKS} unit="шт." />
        </section>

        {/* Transactions */}
        <section
          className="rounded-xl p-5"
          style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        >
          <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
            История транзакций
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="text-left" style={{ color: LABEL }}>
                  <th className="pb-3 pr-4 text-[12px] font-normal uppercase tracking-wide">Дата</th>
                  <th className="pb-3 pr-4 text-[12px] font-normal uppercase tracking-wide">Тип</th>
                  <th className="pb-3 pr-4 text-[12px] font-normal uppercase tracking-wide">Сумма</th>
                  <th className="pb-3 text-[12px] font-normal uppercase tracking-wide">Статус</th>
                </tr>
              </thead>
              <tbody>
                {TX.map((t, i) => {
                  const meta = TX_META[t.type]
                  return (
                    <tr
                      key={i}
                      style={{ borderTop: `1px solid ${BORDER}` }}
                    >
                      <td className="py-3 pr-4" style={{ color: "rgba(255,255,255,0.8)" }}>
                        {t.date}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-2" style={{ color: meta.color }}>
                          <meta.Icon size={15} strokeWidth={1.75} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="py-3 pr-4 font-medium" style={{ color: meta.color }}>
                        {t.amount} {t.token}
                      </td>
                      <td className="py-3">
                        <span
                          className="inline-flex items-center gap-1.5 text-[13px]"
                          style={{ color: UP }}
                        >
                          <Check size={14} strokeWidth={2} />
                          Завершена
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

function HoldingsCard({
  title,
  Icon,
  items,
  unit,
}: {
  title: string
  Icon: LucideIcon
  items: { name: string; amount: number; price: string; change: number }[]
  unit: string
}) {
  return (
    <div
      className="flex flex-col rounded-xl p-5"
      style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
    >
      <h2 className="mb-4 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
        {title}
      </h2>
      <ul className="flex-1 space-y-2">
        {items.map((it) => {
          const positive = it.change >= 0
          return (
            <li
              key={it.name}
              className="flex items-center gap-3 rounded-lg p-3 transition-colors"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: "#0A0A0F" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = ACCENT)}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = BORDER)}
            >
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                style={{ border: `1px solid ${BORDER}`, color: ACCENT }}
              >
                <Icon size={16} strokeWidth={1.75} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px]">{it.name}</p>
                <p className="text-[12px]" style={{ color: LABEL }}>
                  {it.amount} {unit ? unit : "шт."} · {it.price}
                </p>
              </div>
              <span
                className="shrink-0 text-[13px] font-medium"
                style={{ color: positive ? UP : DOWN }}
              >
                {positive ? "+" : ""}
                {it.change}%
              </span>
            </li>
          )
        })}
      </ul>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          className="flex-1 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-colors"
          style={{ backgroundColor: ACCENT, color: "#0A0A0F" }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Купить
        </button>
        <button
          type="button"
          className="flex-1 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
          style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.8)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = ACCENT
            e.currentTarget.style.color = ACCENT
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = BORDER
            e.currentTarget.style.color = "rgba(255,255,255,0.8)"
          }}
        >
          Продать
        </button>
      </div>
    </div>
  )
}
