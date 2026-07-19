"use client"

import { useRouter } from "next/navigation"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import {
  FolderKanban,
  Gem,
  Coins,
  Activity as ActivityIcon,
  Trophy,
  Medal,
  Award,
  Circle,
  Wand2,
  MessageCircle,
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

const METRICS: { label: string; value: string; Icon: LucideIcon }[] = [
  { label: "Проектов", value: "12", Icon: FolderKanban },
  { label: "Артефактов", value: "24", Icon: Gem },
  { label: "Токенов", value: "7 340", Icon: Coins },
  { label: "Активность", value: "89%", Icon: ActivityIcon },
]

const ACTIVITY = [
  { day: "Пн", value: 42 },
  { day: "Вт", value: 68 },
  { day: "Ср", value: 55 },
  { day: "Чт", value: 91 },
  { day: "Пт", value: 74 },
  { day: "Сб", value: 38 },
  { day: "Вс", value: 61 },
]

const ACHIEVEMENTS: { Icon: LucideIcon; name: string; progress: number; total: number; color: string }[] = [
  { Icon: Trophy, name: "Мастер проектов", progress: 12, total: 12, color: "#FFD54A" },
  { Icon: Medal, name: "Кузнец артефактов", progress: 8, total: 12, color: "#00D4FF" },
  { Icon: Award, name: "Голос Таверны", progress: 5, total: 12, color: "#B57BFF" },
]

const PROJECTS: { name: string; status: string; statusColor: string; date: string }[] = [
  { name: "Нейросеть Один", status: "Активен", statusColor: "#4ADE80", date: "12 июля 2026" },
  { name: "Нейросеть Валькирия", status: "В работе", statusColor: "#FFD54A", date: "9 июля 2026" },
  { name: "Кристалл памяти", status: "Завершён", statusColor: "#6A6A8A", date: "3 июля 2026" },
]

const TAVERN: { name: string; text: string; time: string; color: string }[] = [
  { name: "Medusa_Code", text: "Отличная идея по нейроядру!", time: "14:32", color: "#00D4FF" },
  { name: "Assardi_Valkyrie", text: "Поддерживаю, начнём завтра.", time: "13:05", color: "#B57BFF" },
  { name: "Gold_Architect", text: "Когда общая встреча?", time: "11:48", color: "#FFD54A" },
]

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-6 ${className}`}
      style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
    >
      {children}
    </div>
  )
}

function SectionTitle({ Icon, children }: { Icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      <Icon size={16} strokeWidth={1.75} style={{ color: ACCENT }} />
      <h2 className="text-[13px] font-medium uppercase tracking-[0.14em]" style={{ color: LABEL }}>
        {children}
      </h2>
    </div>
  )
}

export function DashboardView() {
  const router = useRouter()

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        {/* Title */}
        <header className="mb-8">
          <h1 className="text-[32px] font-semibold leading-tight">Дашборд</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Обзор системы и активности
          </p>
        </header>

        {/* Metrics */}
        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {METRICS.map((m) => (
            <Card key={m.label}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[24px] font-medium leading-none">{m.value}</div>
                  <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {m.label}
                  </div>
                </div>
                <m.Icon size={20} strokeWidth={1.5} style={{ color: LABEL }} />
              </div>
            </Card>
          ))}
        </section>

        {/* Row 1 — Activity + Achievements */}
        <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle Icon={ActivityIcon}>Активность</SectionTitle>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ACTIVITY} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={BORDER} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: LABEL, fontSize: 12 }}
                    axisLine={{ stroke: BORDER }}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: LABEL, fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: BORDER }}
                    contentStyle={{
                      backgroundColor: "#0A0A0F",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 8,
                      color: "#FFFFFF",
                      fontSize: 12,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={ACCENT}
                    strokeWidth={2}
                    fill="url(#dashFill)"
                    dot={{ r: 3, fill: ACCENT, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card>
            <SectionTitle Icon={Trophy}>Достижения</SectionTitle>
            <ul className="space-y-4">
              {ACHIEVEMENTS.map((a) => {
                const pct = Math.round((a.progress / a.total) * 100)
                return (
                  <li key={a.name} className="flex items-center gap-4">
                    <span
                      className="flex size-11 shrink-0 items-center justify-center rounded-lg"
                      style={{ border: `1px solid ${a.color}`, backgroundColor: "#0A0A0F" }}
                    >
                      <a.Icon size={20} strokeWidth={1.5} style={{ color: a.color }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-[14px]">{a.name}</span>
                        <span className="ml-3 shrink-0 font-mono text-[12px]" style={{ color: LABEL }}>
                          {a.progress}/{a.total}
                        </span>
                      </div>
                      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: BORDER }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: ACCENT }} />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </section>

        {/* Row 2 — Recent projects + Tavern */}
        <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <SectionTitle Icon={FolderKanban}>Последние проекты</SectionTitle>
            <ul className="divide-y" style={{ borderColor: BORDER }}>
              {PROJECTS.map((p) => (
                <li key={p.name} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="truncate text-[14px]">{p.name}</div>
                    <div className="mt-1 text-[12px]" style={{ color: LABEL }}>
                      {p.date}
                    </div>
                  </div>
                  <span className="ml-3 flex shrink-0 items-center gap-2">
                    <Circle size={8} fill={p.statusColor} strokeWidth={0} />
                    <span className="text-[12px]" style={{ color: p.statusColor }}>
                      {p.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle Icon={MessageCircle}>Активность в Таверне</SectionTitle>
            <ul className="space-y-4">
              {TAVERN.map((t) => (
                <li key={t.name} className="flex items-start gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full text-[13px] font-medium"
                    style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}`, color: t.color }}
                  >
                    {t.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-[14px]" style={{ color: t.color }}>
                        {t.name}
                      </span>
                      <span className="ml-3 shrink-0 text-[12px]" style={{ color: LABEL }}>
                        {t.time}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                      {t.text}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        {/* Quick actions */}
        <Card>
          <SectionTitle Icon={Plus}>Быстрые действия</SectionTitle>
          <div className="flex flex-col gap-3 sm:flex-row">
            <QuickAction Icon={FolderKanban} label="Создать проект" onClick={() => router.push("/projects")} />
            <QuickAction Icon={Wand2} label="Создать артефакт" onClick={() => router.push("/forge")} />
            <QuickAction Icon={MessageCircle} label="Перейти в чат" onClick={() => router.push("/messages")} />
          </div>
        </Card>
      </main>
    </div>
  )
}

function QuickAction({ Icon, label, onClick }: { Icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-3 text-[14px] transition-colors"
      style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF", backgroundColor: "transparent" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = ACCENT
        e.currentTarget.style.borderColor = ACCENT
        e.currentTarget.style.color = "#0A0A0F"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.borderColor = BORDER
        e.currentTarget.style.color = "#FFFFFF"
      }}
    >
      <Icon size={16} strokeWidth={1.75} />
      {label}
    </button>
  )
}
