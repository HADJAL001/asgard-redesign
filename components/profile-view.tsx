"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/lib/auth-store"
import { apiClient } from "@/lib/api-client"
import {
  Trophy,
  Star,
  Pencil,
  Share2,
  FolderKanban,
  Coins,
  TrendingUp,
  Award,
  Medal,
  Crown,
  Gem,
  MessageSquare,
  MessageCircle,
  Hammer,
  Bell,
  Camera,
  Wallet,
  ShoppingBag,
  Tag,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"
import { Infinity as InfinityIcon, Lock, DollarSign } from "lucide-react"
import { Navbar } from "./navbar"
import { ArtifactMiniCard } from "./artifact-mini-card"
import { useOsgard, useOsgardStore } from "@/lib/store/osgard-store"
import { formatTokens } from "@/lib/economy"
import { UP, DAY_MS } from "@/lib/tc-market"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=256&q=80"

type Tab = "overview" | "achievements" | "activity" | "settings"

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Обзор" },
  { id: "achievements", label: "Достижения" },
  { id: "activity", label: "Активность" },
  { id: "settings", label: "Настройки" },
]

type Achievement = {
  Icon: LucideIcon
  name: string
  progress: string
  ratio: number
  color: string
  tier: string
}

const ACHIEVEMENTS: Achievement[] = [
  { Icon: Crown, name: "Мастер", progress: "12/12", ratio: 1, color: "#E5E4E2", tier: "Платина" },
  { Icon: Trophy, name: "Золото", progress: "8/12", ratio: 8 / 12, color: "#FBBF24", tier: "Золото" },
  { Icon: Medal, name: "Серебро", progress: "5/12", ratio: 5 / 12, color: "#CBD5E1", tier: "Серебро" },
  { Icon: Award, name: "Бронза", progress: "3/12", ratio: 3 / 12, color: "#D97706", tier: "Бронза" },
  { Icon: Gem, name: "Коллекционер", progress: "10/12", ratio: 10 / 12, color: "#E5E4E2", tier: "Платина" },
  { Icon: Star, name: "Легенда", progress: "6/12", ratio: 6 / 12, color: "#FBBF24", tier: "Золото" },
  { Icon: Hammer, name: "Кузнец", progress: "4/12", ratio: 4 / 12, color: "#CBD5E1", tier: "Серебро" },
  { Icon: MessageSquare, name: "Оратор", progress: "2/12", ratio: 2 / 12, color: "#D97706", tier: "Бронза" },
]

const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

// deterministic activity levels 0..4 for 7 days x 4 weeks
const HEATMAP: number[][] = [
  [2, 3, 1, 4, 0, 3, 2],
  [1, 2, 3, 2, 4, 1, 0],
  [3, 4, 2, 3, 1, 2, 4],
  [0, 1, 3, 4, 2, 3, 1],
]

const LEVEL_COLOR = ["#14141E", "#0E3A4A", "#0F5566", "#0FA0B8", "#00D4FF"]

const ACTIVITY_STATS = [
  { Icon: MessageSquare, n: "128", l: "Постов" },
  { Icon: MessageCircle, n: "342", l: "Комментариев" },
  { Icon: Hammer, n: "56", l: "Улучшений" },
]

export function ProfileView() {
  const [tab, setTab] = useState<Tab>("overview")
  const { user } = useAuth()
  const { wallet } = useOsgard()
  const projects = useOsgardStore((s) => s.projects)
  const leaderboard = useOsgardStore((s) => s.leaderboard)
  const fetchProjects = useOsgardStore((s) => s.fetchProjects)
  const fetchArtifacts = useOsgardStore((s) => s.fetchArtifacts)
  const fetchLeaderboard = useOsgardStore((s) => s.fetchLeaderboard)

  // artifacts/projects/leaderboard не гидратируются глобально (в отличие от
  // wallet/tcState/stakes/transactions в OsgardStoreProvider) — подгружаем
  // их здесь один раз, только для авторизованного пользователя.
  useEffect(() => {
    if (!user) return
    fetchProjects({ skipAuthRedirect: true })
    fetchArtifacts({ skipAuthRedirect: true })
    fetchLeaderboard({ skipAuthRedirect: true })
  }, [user, fetchProjects, fetchArtifacts, fetchLeaderboard])

  const rank = user ? leaderboard.findIndex((e) => e.userId === user.id) + 1 : 0
  const displayName = user?.displayName || user?.username || "Пользователь"
  const level = user?.level ?? 1

  const metrics = [
    { Icon: FolderKanban, n: String(projects.length), l: "Проектов" },
    { Icon: Coins, n: `${formatTokens(wallet.timecoin)} ∞`, l: "Токенов" },
    { Icon: TrendingUp, n: String(level), l: "Уровень" },
    { Icon: Trophy, n: rank > 0 ? `#${rank}` : "—", l: "Рейтинг" },
  ]

  function handleShare() {
    if (typeof window === "undefined") return
    navigator.clipboard?.writeText(window.location.href).catch(() => {})
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        {/* Title */}
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Профиль</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Архитектор вселенной — уровень {level}
          </p>
        </div>

        {/* Avatar + info */}
        <section className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-stretch">
          {/* Avatar card */}
          <div
            className="flex shrink-0 items-center justify-center rounded-2xl p-6"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <img
              src={user?.avatarUrl || AVATAR || "/placeholder.svg"}
              alt={displayName}
              className="size-32 rounded-full object-cover"
              style={{ border: "2px solid #2A2A3E" }}
            />
          </div>

          {/* Info card */}
          <div
            className="flex flex-1 flex-col justify-center gap-4 rounded-2xl p-6 md:p-8"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <div>
              <h2 className="text-[24px] font-semibold leading-tight">{displayName}</h2>
              <p className="mt-1 text-[16px]" style={{ color: "#6A6A8A" }}>
                Архитектор · Lvl. {level}
              </p>
            </div>

            <div className="mt-1 flex flex-wrap gap-3">
              <OutlineButton Icon={Pencil} onClick={() => setTab("settings")}>Редактировать</OutlineButton>
              <OutlineButton Icon={Share2} onClick={handleShare}>Поделиться</OutlineButton>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {metrics.map(({ Icon, n, l }) => (
            <div
              key={l}
              className="rounded-xl p-5"
              style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
            >
              <Icon size={18} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
              <p className="mt-3 text-[24px] font-medium">{n}</p>
              <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {l}
              </p>
            </div>
          ))}
        </section>

        {/* Tabs */}
        <div className="mt-10 flex gap-8 border-b" style={{ borderColor: "#2A2A3E" }} role="tablist">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className="relative -mb-px py-3 text-[14px] font-medium uppercase tracking-[0.08em] transition-colors"
                style={{ color: active ? "#00D4FF" : "rgba(255,255,255,0.5)" }}
              >
                {t.label}
                <span
                  className="absolute inset-x-0 bottom-0 h-0.5 transition-opacity"
                  style={{ backgroundColor: "#00D4FF", opacity: active ? 1 : 0 }}
                  aria-hidden="true"
                />
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        <div className="mt-8">
          {tab === "overview" && <OverviewTab />}
          {tab === "achievements" && <AchievementsTab />}
          {tab === "activity" && <ActivityTab />}
          {tab === "settings" && <SettingsTab />}
        </div>
      </main>
    </div>
  )
}

function OutlineButton({
  Icon,
  children,
  onClick,
}: {
  Icon: LucideIcon
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] transition-colors"
      style={{ border: "1px solid #2A2A3E", color: "#FFFFFF" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = "#00D4FF"
        e.currentTarget.style.borderColor = "#00D4FF"
        e.currentTarget.style.color = "#0A0A0F"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent"
        e.currentTarget.style.borderColor = "#2A2A3E"
        e.currentTarget.style.color = "#FFFFFF"
      }}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
      {children}
    </button>
  )
}

function Panel({ title, extra, children }: { title: string; extra?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6 md:p-8" style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold uppercase tracking-[0.08em]">{title}</h3>
        {extra && (
          <span className="text-[13px]" style={{ color: "#6A6A8A" }}>
            {extra}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function AchievementCard({ a }: { a: Achievement }) {
  return (
    <article
      className="rounded-xl p-5 transition-all duration-150"
      style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#00D4FF"
        e.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#2A2A3E"
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div
        className="flex size-12 items-center justify-center rounded-lg"
        style={{ border: `1px solid ${a.color}33` }}
      >
        <a.Icon size={32} strokeWidth={1.5} style={{ color: a.color }} aria-hidden="true" />
      </div>
      <p className="mt-4 text-[14px] font-medium">{a.name}</p>
      <p className="mt-0.5 text-[12px]" style={{ color: "#6A6A8A" }}>
        {a.tier}
      </p>
      <div className="mt-3 h-1 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#2A2A3E" }}>
        <div className="h-full rounded-full" style={{ width: `${a.ratio * 100}%`, backgroundColor: "#00D4FF" }} />
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        {a.progress}
      </p>
    </article>
  )
}

function OverviewTab() {
  return (
    <div className="flex flex-col gap-6">
      <TCHoldingsPanel />
      <EarningsPanel />
      <ArtifactsPanel />

      <Panel title="Достижения">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {ACHIEVEMENTS.slice(0, 4).map((a) => (
            <AchievementCard key={a.name} a={a} />
          ))}
        </div>
      </Panel>

      <Panel title="Активность">
        <Heatmap />
      </Panel>
    </div>
  )
}

function TCHoldingsPanel() {
  const { wallet, usdFor, tcPrice, change24h, stakes, unstakeTC } = useOsgard()
  const active = stakes.filter((s) => s.status === "active")
  const stakedByUser = active.reduce((s, x) => s + x.amountTC, 0)
  const up = change24h >= 0

  const stats = [
    { Icon: InfinityIcon, n: `${formatTokens(wallet.timecoin)} ∞`, l: "Баланс TimeCoin", color: "#F1C40F" },
    { Icon: DollarSign, n: `$${usdFor(wallet.timecoin).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, l: "Стоимость (USD)", color: UP },
    { Icon: Lock, n: `${formatTokens(stakedByUser)} ∞`, l: "В стейкинге", color: "#9B59B6" },
    { Icon: TrendingUp, n: `${up ? "+" : ""}${change24h.toFixed(2)}%`, l: "Курс за 24ч", color: up ? UP : "#EF4444" },
  ]

  return (
    <Panel title="TimeCoin" extra={`1 ∞ = $${tcPrice.toFixed(2)}`}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ Icon, n, l, color }) => (
          <div key={l} className="rounded-xl p-5" style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}>
            <Icon size={18} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
            <p className="mt-3 text-[24px] font-medium" style={{ color }}>{n}</p>
            <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>{l}</p>
          </div>
        ))}
      </div>

      {active.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {active.map((s) => {
            const left = Math.max(0, Math.ceil((s.endTs - Date.now()) / DAY_MS))
            return (
              <div key={s.id} className="flex items-center justify-between rounded-xl px-4 py-3 text-[14px]" style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}>
                <span className="inline-flex items-center gap-2">
                  <Lock size={15} strokeWidth={1.75} style={{ color: "#9B59B6" }} aria-hidden="true" />
                  {formatTokens(s.amountTC)} ∞ · {(s.apr * 100).toFixed(0)}% APR
                </span>
                <span className="inline-flex items-center gap-3">
                  <span className="text-[12px]" style={{ color: "#6A6A8A" }}>
                    {left > 0 ? `${left} дн.` : "Готово"}
                  </span>
                  <button
                    type="button"
                    onClick={() => unstakeTC(s.id)}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
                    style={{ border: `1px solid ${left > 0 ? "#2A2A3E" : UP}`, color: left > 0 ? "rgba(255,255,255,0.7)" : UP }}
                  >
                    {left > 0 ? "Досрочно" : "Забрать"}
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { href: "/exchange", label: "Биржа TimeCoin", Icon: TrendingUp },
          { href: "/stake", label: "Стейкинг", Icon: Lock },
          { href: "/economy", label: "Экономика", Icon: Coins },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between rounded-xl px-4 py-3 text-[14px] transition-colors"
            style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
          >
            <span className="inline-flex items-center gap-2">
              <Icon size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
              {label}
            </span>
            <ChevronRight size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Panel>
  )
}

function EarningsPanel() {
  const { user } = useAuth()
  const artifacts = useOsgardStore((s) => s.artifacts)
  const transactions = useOsgardStore((s) => s.transactions)
  const leaderboard = useOsgardStore((s) => s.leaderboard)

  const totalEarned = transactions
    .filter((t) => t.currency === "timecoin" && (t.type === "sell" || t.type === "dividend"))
    .reduce((sum, t) => sum + t.amount, 0)
  const sold = artifacts.filter((a) => a.status === "sold").length
  const listed = artifacts.filter((a) => a.status === "listed").length
  const rank = user ? leaderboard.findIndex((e) => e.userId === user.id) + 1 : 0

  const stats = [
    { Icon: Wallet, n: formatTokens(totalEarned), l: "Заработано, токенов", color: "#00D4FF" },
    { Icon: ShoppingBag, n: String(sold), l: "Артефактов продано", color: "#FFFFFF" },
    { Icon: Tag, n: String(listed), l: "В продаже сейчас", color: "#FFFFFF" },
    { Icon: Trophy, n: rank > 0 ? `#${rank}` : "—", l: "Место в рейтинге", color: "#FBBF24" },
  ]

  const links = [
    { href: "/marketplace", label: "Маркетплейс", Icon: ShoppingBag },
    { href: "/my-sales", label: "Мои продажи", Icon: Tag },
    { href: "/leaderboard", label: "Рейтинг архитекторов", Icon: Trophy },
  ]

  return (
    <Panel title="Экономика">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ Icon, n, l, color }) => (
          <div
            key={l}
            className="rounded-xl p-5"
            style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
          >
            <Icon size={18} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
            <p className="mt-3 text-[24px] font-medium" style={{ color }}>
              {n}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              {l}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {links.map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center justify-between rounded-xl px-4 py-3 text-[14px] transition-colors"
            style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
          >
            <span className="inline-flex items-center gap-2">
              <Icon size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
              {label}
            </span>
            <ChevronRight size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
          </Link>
        ))}
      </div>
    </Panel>
  )
}

function ArtifactsPanel() {
  const { tcPrice } = useOsgard()
  const artifacts = useOsgardStore((s) => s.artifacts)
  const preview = artifacts.slice(0, 6)

  return (
    <Panel title="Мои артефакты" extra={artifacts.length > 6 ? `${artifacts.length} всего` : undefined}>
      {preview.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {preview.map((a) => (
            <ArtifactMiniCard key={a.id} a={a} tcUsdPrice={tcPrice} />
          ))}
        </div>
      ) : (
        <p className="py-6 text-center text-[14px]" style={{ color: "rgba(255,255,255,0.35)" }}>
          Пока нет артефактов — скуйте первый в кузнице
        </p>
      )}

      {artifacts.length > 6 && (
        <Link
          href="/artifacts"
          className="mt-4 flex items-center justify-between rounded-xl px-4 py-3 text-[14px] transition-colors"
          style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
        >
          <span>Все артефакты</span>
          <ChevronRight size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
        </Link>
      )}
    </Panel>
  )
}

function AchievementsTab() {
  return (
    <Panel title="Достижения">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {ACHIEVEMENTS.map((a) => (
          <AchievementCard key={a.name} a={a} />
        ))}
      </div>
    </Panel>
  )
}

function Heatmap() {
  return (
    <div className="max-w-xl">
      {/* Day labels */}
      <div className="grid grid-cols-7 gap-2">
        {DAYS.map((d) => (
          <span key={d} className="text-center text-[12px]" style={{ color: "#6A6A8A" }}>
            {d}
          </span>
        ))}
      </div>
      {/* Weeks */}
      <div className="mt-2 flex flex-col gap-2">
        {HEATMAP.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-2">
            {week.map((lvl, di) => (
              <div
                key={di}
                className="aspect-square rounded-md"
                style={{ backgroundColor: LEVEL_COLOR[lvl], border: "1px solid #2A2A3E" }}
                title={`${DAYS[di]}: уровень ${lvl}`}
              />
            ))}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="mt-4 flex items-center justify-end gap-2 text-[12px]" style={{ color: "#6A6A8A" }}>
        <span>Меньше</span>
        {LEVEL_COLOR.map((c, i) => (
          <span
            key={i}
            className="size-3 rounded-sm"
            style={{ backgroundColor: c, border: "1px solid #2A2A3E" }}
            aria-hidden="true"
          />
        ))}
        <span>Больше</span>
      </div>
    </div>
  )
}

function ActivityTab() {
  return (
    <div className="flex flex-col gap-6">
      <Panel title="Активность за месяц">
        <Heatmap />
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {ACTIVITY_STATS.map(({ Icon, n, l }) => (
          <div
            key={l}
            className="rounded-xl p-5"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <Icon size={18} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
            <p className="mt-3 text-[24px] font-medium">{n}</p>
            <p className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              {l}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingsTab() {
  const { user, refreshMe } = useAuth()
  const [displayName, setDisplayName] = useState(user?.displayName || user?.username || "")
  const [bio, setBio] = useState(user?.bio || "")
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle")

  // user приходит сначала из локального кэша (без displayName/bio), затем
  // асинхронно подменяется свежим ответом /auth/me — пересинхронизируем поля,
  // иначе форма навсегда останется с данными, снятыми на момент первого рендера.
  useEffect(() => {
    if (!user) return
    setDisplayName(user.displayName || user.username || "")
    setBio(user.bio || "")
  }, [user?.displayName, user?.bio, user?.username])

  async function handleSave() {
    setSaving(true)
    setStatus("idle")
    try {
      await apiClient.patch("/auth/me", { displayName, bio })
      await refreshMe()
      setStatus("ok")
    } catch {
      setStatus("error")
    } finally {
      setSaving(false)
    }
  }

  async function handleChangeAvatar() {
    const url = typeof window !== "undefined" ? window.prompt("Ссылка на изображение аватара:", user?.avatarUrl || "") : null
    if (!url) return
    try {
      await apiClient.patch("/auth/me", { avatarUrl: url })
      await refreshMe()
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel title="Профиль">
        <div className="flex flex-col gap-6">
          {/* Avatar change */}
          <div className="flex items-center gap-4">
            <img
              src={user?.avatarUrl || AVATAR || "/placeholder.svg"}
              alt={displayName || "Аватар"}
              className="size-16 rounded-full object-cover"
              style={{ border: "1px solid #2A2A3E" }}
            />
            <OutlineButton Icon={Camera} onClick={handleChangeAvatar}>Сменить аватар</OutlineButton>
          </div>

          {/* Name */}
          <Field label="Имя">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[#00D4FF]"
              style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
            />
          </Field>

          {/* Bio */}
          <Field label="Био">
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full resize-none rounded-lg px-3 py-2.5 text-[14px] outline-none focus:border-[#00D4FF]"
              style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Уведомления">
        <div className="flex flex-col gap-4">
          {[
            { label: "Новые достижения", on: true },
            { label: "Сообщения в чате", on: true },
            { label: "Активность в сообществе", on: false },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[14px]">
                <Bell size={16} strokeWidth={1.5} style={{ color: "#6A6A8A" }} aria-hidden="true" />
                {row.label}
              </span>
              <Toggle defaultOn={row.on} label={row.label} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="flex items-center justify-end gap-3">
        {status === "ok" && (
          <span className="text-[13px]" style={{ color: "#4ADE80" }} role="status">
            Сохранено
          </span>
        )}
        {status === "error" && (
          <span className="text-[13px]" style={{ color: "#EF4444" }} role="status">
            Не удалось сохранить
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg px-6 py-2.5 text-[14px] font-medium transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.opacity = "0.9" }}
          onMouseLeave={(e) => { if (!saving) e.currentTarget.style.opacity = "1" }}
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-[13px]" style={{ color: "#6A6A8A" }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Toggle({ defaultOn, label }: { defaultOn: boolean; label: string }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => setOn((v) => !v)}
      className="relative h-6 w-11 rounded-full transition-colors"
      style={{ backgroundColor: on ? "#00D4FF" : "#2A2A3E" }}
    >
      <span
        className="absolute top-0.5 size-5 rounded-full transition-all"
        style={{ left: on ? "22px" : "2px", backgroundColor: "#FFFFFF" }}
      />
    </button>
  )
}
