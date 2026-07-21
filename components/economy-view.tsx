"use client"

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  Infinity as InfinityIcon,
  Flame,
  Landmark,
  TrendingUp,
  TrendingDown,
  Coins,
  DollarSign,
  Lock,
  BarChart3,
} from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "./osgard-store"
import { COLORS, EMISSION_SERIES, PLATFORM_FEE, formatTokens } from "@/lib/economy"
import { TC_TOTAL_CAP, UP, DOWN } from "@/lib/tc-market"

function fmtUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function tooltipStyle() {
  return {
    backgroundColor: "#14141E",
    border: "1px solid #2A2A3E",
    borderRadius: 8,
    color: "#FFFFFF",
    fontSize: 12,
  }
}

export function EconomyView() {
  const {
    tcPrice,
    change24h,
    changeMonth,
    volume24hTC,
    burnedTC,
    stakedTC,
    circulatingTC,
    marketCapUSD,
    priceHistory,
  } = useOsgard()

  const up = change24h >= 0
  const mintedPct = (circulatingTC / TC_TOTAL_CAP) * 100

  // Downsample the daily history to a monthly-ish price line for the macro chart
  const priceLine = priceHistory
    .filter((_, i) => i % 12 === 0 || i === priceHistory.length - 1)
    .map((p) => ({
      label: new Date(p.ts).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      price: p.price,
    }))

  const metrics = [
    { n: fmtUSD(tcPrice), l: "Цена TimeCoin", Icon: DollarSign, color: UP },
    { n: `${formatTokens(Math.round(volume24hTC))} ∞`, l: "Объём 24ч", Icon: BarChart3, color: COLORS.accent },
    { n: fmtUSD(marketCapUSD), l: "Капитализация", Icon: TrendingUp, color: "#F1C40F" },
    { n: `${formatTokens(circulatingTC)} ∞`, l: "В обороте", Icon: Coins, color: COLORS.accent },
    { n: `${formatTokens(stakedTC)} ∞`, l: "Застейкано", Icon: Lock, color: "#9B59B6" },
    { n: `${formatTokens(burnedTC)} ∞`, l: "Сожжено", Icon: Flame, color: COLORS.red },
  ]

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Экономика</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Дефляционная модель TimeCoin · цена формируется рынком · комиссия платформы {PLATFORM_FEE * 100}%
          </p>
        </div>

        {/* Live price hero */}
        <section
          className="mt-8 flex flex-col gap-6 rounded-2xl p-7 md:flex-row md:items-center md:justify-between"
          style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
        >
          <div>
            <p className="flex items-center gap-2 text-[13px]" style={{ color: COLORS.label }}>
              <InfinityIcon size={15} strokeWidth={1.75} style={{ color: "#00D4FF" }} aria-hidden="true" />
              TimeCoin · TC / USD
            </p>
            <div className="mt-2 flex items-end gap-3">
              <span className="text-[44px] font-semibold leading-none tracking-tight">{fmtUSD(tcPrice)}</span>
              <span
                className="mb-1 inline-flex items-center gap-1 text-[15px] font-medium"
                style={{ color: up ? UP : DOWN }}
              >
                {up ? <TrendingUp size={16} strokeWidth={2} /> : <TrendingDown size={16} strokeWidth={2} />}
                {up ? "+" : ""}
                {change24h.toFixed(2)}% · 24ч
              </span>
            </div>
            <p className="mt-2 text-[13px]" style={{ color: changeMonth >= 0 ? UP : DOWN }}>
              {changeMonth >= 0 ? "+" : ""}
              {changeMonth.toFixed(1)}% за 30 дней
            </p>
          </div>

          {/* Supply progress toward cap */}
          <div className="w-full max-w-[320px]">
            <div className="flex items-center justify-between text-[12px]" style={{ color: COLORS.label }}>
              <span>Эмитировано от лимита</span>
              <span style={{ color: "#FFFFFF" }}>{mintedPct.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#0A0A0F" }}>
              <div className="h-full rounded-full" style={{ width: `${mintedPct}%`, backgroundColor: "#00D4FF" }} />
            </div>
            <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>
              Лимит эмиссии: {formatTokens(TC_TOTAL_CAP)} ∞ · дефляционная модель
            </p>
          </div>
        </section>

        {/* Live macro metrics */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {metrics.map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={18} strokeWidth={1.5} style={{ color: m.color }} aria-hidden="true" />
              <p className="mt-3 text-[22px] font-medium leading-none">{m.n}</p>
              <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>
                {m.l}
              </p>
            </div>
          ))}
        </div>

        {/* Live price history */}
        <section className="mt-8 rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
            Курс TimeCoin · год
          </h2>
          <div className="mt-6 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={priceLine} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tcprice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={UP} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={UP} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3E" vertical={false} />
                <XAxis dataKey="label" stroke="#6A6A8A" fontSize={12} tickLine={false} axisLine={false} minTickGap={40} />
                <YAxis stroke="#6A6A8A" fontSize={12} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `$${v}`} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v) => [`$${Number(v).toFixed(2)}`, "Цена"]} />
                <Area type="monotone" dataKey="price" stroke={UP} strokeWidth={2} fill="url(#tcprice)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Circulating supply (historical) */}
        <section className="mt-6 rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
            TimeCoin в обороте
          </h2>
          <div className="mt-6 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={EMISSION_SERIES} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="circ" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00D4FF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#00D4FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3E" vertical={false} />
                <XAxis dataKey="month" stroke="#6A6A8A" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6A6A8A" fontSize={12} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v) => [`${formatTokens(Number(v))} ∞`, "В обороте"]} />
                <Area type="monotone" dataKey="circulating" stroke="#00D4FF" strokeWidth={2} fill="url(#circ)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Treasury vs burn */}
        <section className="mt-6 rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
            Казна и сжигание
          </h2>
          <div className="mt-6 h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={EMISSION_SERIES} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A3E" vertical={false} />
                <XAxis dataKey="month" stroke="#6A6A8A" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#6A6A8A" fontSize={12} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip contentStyle={tooltipStyle()} formatter={(v, n) => [`${formatTokens(Number(v))} ∞`, n === "treasury" ? "Казна" : "Сожжено"]} />
                <Line type="monotone" dataKey="treasury" stroke="#4ADE80" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="burned" stroke="#F87171" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap gap-5 text-[13px]">
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: COLORS.green }} /> Казна
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: COLORS.red }} /> Сожжено
            </span>
          </div>
        </section>

        {/* Cycle explainer */}
        <section className="mt-6 rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
            Замкнутый цикл
          </h2>
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Улучшения", d: "TC сжигается при эволюции артефактов", Icon: Flame, c: COLORS.red },
              { t: "Торговля", d: "Сделки на бирже двигают цену TC", Icon: TrendingUp, c: COLORS.accent },
              { t: "Стейкинг", d: "Блокировка TC сокращает предложение", Icon: Lock, c: "#9B59B6" },
              { t: "Комиссия 5%", d: "Идёт в казну OSGARD", Icon: Landmark, c: COLORS.green },
            ].map((s) => (
              <div key={s.t} className="rounded-lg p-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
                <s.Icon size={18} strokeWidth={1.5} style={{ color: s.c }} aria-hidden="true" />
                <p className="mt-3 text-[14px]">{s.t}</p>
                <p className="mt-1 text-[12px]" style={{ color: COLORS.label }}>
                  {s.d}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}
