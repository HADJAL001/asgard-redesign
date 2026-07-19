"use client"

import { useMemo, useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  FolderKanban,
  Coins,
  Activity,
  TrendingUp,
  Gem,
  Crown,
  Sparkles,
  Circle,
  FileText,
  MessageSquare,
  Wand2,
  Plus,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */
const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"

type Range = "day" | "week" | "month" | "year" | "all"

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
  { id: "all", label: "Всё время" },
]

/* deterministic pseudo-random so SSR matches client */
function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function buildActivity(range: Range) {
  const config: Record<Range, { points: number; labels: string[]; base: number; seed: number }> = {
    day: { points: 8, labels: ["00", "03", "06", "09", "12", "15", "18", "21"], base: 20, seed: 11 },
    week: { points: 7, labels: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], base: 60, seed: 23 },
    month: { points: 10, labels: ["1", "4", "7", "10", "13", "16", "19", "22", "25", "28"], base: 120, seed: 41 },
    year: { points: 12, labels: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"], base: 300, seed: 67 },
    all: { points: 12, labels: ["2019", "", "2020", "", "2021", "", "2022", "", "2023", "", "2024", "2025"], base: 500, seed: 89 },
  }
  const c = config[range]
  const rnd = seeded(c.seed)
  return c.labels.slice(0, c.points).map((label, i) => ({
    label,
    value: Math.round(c.base + c.base * 0.6 * rnd() + i * (c.base * 0.08)),
  }))
}

function buildTokens(range: Range) {
  const seedMap: Record<Range, number> = { day: 5, week: 13, month: 29, year: 53, all: 97 }
  const rnd = seeded(seedMap[range])
  const n = range === "day" ? 8 : range === "week" ? 7 : range === "year" ? 12 : 10
  return Array.from({ length: n }, (_, i) => ({
    label: String(i + 1),
    used: Math.round(120 + 220 * rnd() + i * 12),
  }))
}

const PROJECTS = [
  { name: "Активные", value: 7, color: ACCENT },
  { name: "В работе", value: 3, color: "#F59E0B" },
  { name: "Завершены", value: 2, color: "#6A6A8A" },
]

const METRICS: { label: string; value: string; Icon: LucideIcon; trend?: string }[] = [
  { label: "Проектов", value: "12", Icon: FolderKanban },
  { label: "Токенов", value: "7 340", Icon: Coins },
  { label: "Активность", value: "89%", Icon: Activity },
  { label: "Рост", value: "+18%", Icon: TrendingUp, trend: "up" },
]

function CardTip({ active, payload, suffix }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-md px-3 py-1.5 font-sans text-[12px]"
      style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
    >
      {payload[0].value}
      {suffix ? ` ${suffix}` : ""}
    </div>
  )
}

export function AnalyticsView() {
  const [range, setRange] = useState<Range>("week")
  const activity = useMemo(() => buildActivity(range), [range])
  const tokens = useMemo(() => buildTokens(range), [range])
  const projectTotal = PROJECTS.reduce((s, p) => s + p.value, 0)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 py-10 md:px-10">
        {/* Title */}
        <header className="mb-8">
          <h1 className="text-[32px] font-semibold leading-tight">Аналитика</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Полная статистика по проектам и активности
          </p>
        </header>

        {/* Metrics */}
        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {METRICS.map(({ label, value, Icon, trend }) => (
            <div
              key={label}
              className="rounded-xl p-5 transition-transform duration-150 hover:-translate-y-0.5"
              style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px]" style={{ color: LABEL }}>
                  {label}
                </span>
                <Icon size={16} strokeWidth={1.5} style={{ color: trend ? "#22C55E" : LABEL }} aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[24px] font-medium">{value}</span>
                {trend === "up" && <TrendingUp size={16} strokeWidth={2} style={{ color: "#22C55E" }} aria-hidden="true" />}
              </div>
            </div>
          ))}
        </section>

        {/* Time filters */}
        <nav className="mb-8 flex flex-wrap gap-6" aria-label="Период">
          {RANGES.map((r) => {
            const active = r.id === range
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className="relative pb-2 text-[13px] uppercase tracking-[0.08em] transition-colors"
                style={{ color: active ? ACCENT : "rgba(255,255,255,0.45)" }}
              >
                {r.label}
                <span
                  className="absolute bottom-0 left-0 h-0.5 w-full transition-opacity"
                  style={{ backgroundColor: ACCENT, opacity: active ? 1 : 0 }}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </nav>

        {/* Activity chart */}
        <section
          className="mb-8 rounded-xl p-6 transition-transform duration-150 hover:-translate-y-0.5"
          style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
        >
          <h2 className="mb-5 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
            Активность
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="actFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={BORDER} vertical={false} />
                <XAxis dataKey="label" stroke={LABEL} tick={{ fill: LABEL, fontSize: 12 }} tickLine={false} axisLine={{ stroke: BORDER }} />
                <YAxis stroke={LABEL} tick={{ fill: LABEL, fontSize: 12 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip content={<CardTip />} cursor={{ stroke: BORDER }} />
                <Area type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} fill="url(#actFill)" dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }} activeDot={{ r: 5, fill: ACCENT }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Row 1: Projects pie + Tokens line */}
        <section className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Projects */}
          <div className="rounded-xl p-6 transition-transform duration-150 hover:-translate-y-0.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <h2 className="mb-5 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
              Проекты
            </h2>
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="h-40 w-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={PROJECTS} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={2} stroke="none">
                      {PROJECTS.map((p) => (
                        <Cell key={p.name} fill={p.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CardTip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 space-y-3">
                {PROJECTS.map((p) => (
                  <li key={p.name} className="flex items-center justify-between text-[14px]">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                      <span style={{ color: "rgba(255,255,255,0.8)" }}>{p.name}</span>
                    </span>
                    <span style={{ color: LABEL }}>
                      {p.value} · {Math.round((p.value / projectTotal) * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Tokens */}
          <div className="rounded-xl p-6 transition-transform duration-150 hover:-translate-y-0.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <h2 className="mb-5 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
              Токены
            </h2>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tokens} margin={{ top: 6, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={BORDER} vertical={false} />
                  <XAxis dataKey="label" stroke={LABEL} tick={{ fill: LABEL, fontSize: 11 }} tickLine={false} axisLine={{ stroke: BORDER }} />
                  <YAxis stroke={LABEL} tick={{ fill: LABEL, fontSize: 11 }} tickLine={false} axisLine={false} width={40} />
                  <Tooltip content={<CardTip />} cursor={{ stroke: BORDER }} />
                  <Line type="monotone" dataKey="used" stroke={ACCENT} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: ACCENT }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                { k: "Использовано", v: "2 660" },
                { k: "Доступно", v: "7 340" },
                { k: "Сгорание", v: "240/день" },
              ].map((t) => (
                <li key={t.k} className="rounded-lg py-3" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}>
                  <div className="text-[15px] font-medium">{t.v}</div>
                  <div className="mt-1 text-[11px]" style={{ color: LABEL }}>
                    {t.k}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Row 2: Artifacts + user activity */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StatCard
            title="Артефакты"
            rows={[
              { Icon: Sparkles, label: "Всего", value: "24", color: LABEL },
              { Icon: Crown, label: "Легендарные", value: "3", color: "#F59E0B" },
              { Icon: Gem, label: "Эпические", value: "7", color: "#A855F7" },
              { Icon: Circle, label: "Обычные", value: "14", color: LABEL },
            ]}
          />
          <StatCard
            title="Активность пользователя"
            rows={[
              { Icon: FileText, label: "Посты", value: "34", color: ACCENT },
              { Icon: MessageSquare, label: "Комментарии", value: "89", color: ACCENT },
              { Icon: Wand2, label: "Улучшения", value: "12", color: ACCENT },
              { Icon: Plus, label: "Создано", value: "5", color: ACCENT },
            ]}
          />
        </section>
      </main>
    </div>
  )
}

function StatCard({
  title,
  rows,
}: {
  title: string
  rows: { Icon: LucideIcon; label: string; value: string; color: string }[]
}) {
  return (
    <div className="rounded-xl p-6 transition-transform duration-150 hover:-translate-y-0.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <h2 className="mb-5 text-[13px] uppercase tracking-[0.12em]" style={{ color: LABEL }}>
        {title}
      </h2>
      <ul className="space-y-2">
        {rows.map(({ Icon, label, value, color }) => (
          <li
            key={label}
            className="flex items-center justify-between rounded-lg px-4 py-3"
            style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}
          >
            <span className="flex items-center gap-3 text-[14px]" style={{ color: "rgba(255,255,255,0.8)" }}>
              <Icon size={16} strokeWidth={1.5} style={{ color }} aria-hidden="true" />
              {label}
            </span>
            <span className="text-[15px] font-medium">{value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
