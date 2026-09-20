"use client"

import React, { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  UserPlus,
  FolderKanban,
  Gem,
  Activity as ActivityIcon,
  Coins,
  Search,
  ShieldCheck,
  ShieldOff,
  Ban,
  CheckCircle2,
  Gift,
  ScrollText,
  TrendingUp,
  CreditCard,
  Gauge,
  Sparkles,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { useAuth, useRequireAuth } from "@/lib/auth-store"
import { displayAiModelName } from "@/lib/ai-model-labels"

/* ---- Palette ----
   bg #10181d · card #17242a · accent #d7ae57 · text #FFFFFF · label #9eb2bc · border #30424b */
const ACCENT = "#d7ae57"
const CARD = "#17242a"
const BORDER = "#30424b"
const LABEL = "#9eb2bc"

type AdminStats = {
  totalUsers: number
  newUsers24h: number
  totalProjects: number
  totalArtifacts: number
  transactions24h: number
  totalCreditsInCirculation: number
  totalTcInCirculation: number
}

type AdminUser = {
  id: number
  username: string
  email: string
  role: string
  banned: number | boolean
  created_at: string | number
}

type AdminLog = {
  id: number
  action: string
  meta: Record<string, any> | null
  ip: string | null
  userAgent: string | null
  status: number | null
  createdAt: number
  admin: { id: number; username: string }
  target: { id: number; username: string } | null
}

type AdminFunnel = {
  days: number
  registered: number
  activated: number
  paid: number
  activationRate: number
  paidConversionRate: number
}

type AdminRetentionRow = {
  cohortDay: string
  cohortSize: number
  d1: number
  d7: number
  d30: number
}

type AdminPaywallFunnel = {
  days: number
  totalViews: number
  totalClicks: number
  totalConversions: number
  totalAbandons: number
  viewToClickRate: number
  clickToConversionRate: number
  overallConversionRate: number
  mostPopularTier: string | null
  avgDecisionTimeSec: number
  byTier: { tier: string; clicks: number; conversions: number; notConverted: number }[]
}

type TokenLimitRecommendation = {
  samples: number
  p95: number
  headroom: number
  recommended: number
}

type AdminGenerationBudget = {
  usage: {
    runs: number
    completed: number
    failed: number
    running: number
    calls: number
    tokensIn: number
    tokensOut: number
    totalTokens: number
    unmeasuredCalls: number
    pricedUsd: number
    pricedCalls: number
    unpricedCalls: number
    estimatedCostCalls: number
    byProvider: Record<string, { calls: number; tokens: number }>
    byModel: Record<string, { provider: string; model: string; calls: number; inputTokens: number; outputTokens: number; estimatedCalls: number }>
    byKind: Record<string, { runs: number; tokens: number }>
  }
  methodology: { minimumSamples: number }
  recommendations: Record<
    "quickTemplate" | "quickAi" | "standardAi" | "deepAi" | "platform",
    { samples: number; limit: TokenLimitRecommendation | null }
  >
}
type AlphaRelease = { version: string; notes: string; publishedAt: number }

const ACTION_LABELS: Record<string, string> = {
  set_role: "Изменение роли",
  set_banned: "Изменение блокировки",
  grant_tokens: "Выдача токенов",
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-6 ${className}`}
      style={{
        backgroundColor: CARD,
        backgroundImage: "linear-gradient(112deg, transparent 0 35%, rgba(215,174,87,0.055) 35.2% 35.35%, transparent 35.6% 100%), linear-gradient(32deg, transparent 0 68%, rgba(255,255,255,0.035) 68.2% 68.35%, transparent 68.6% 100%)",
        border: `1px solid ${BORDER}`,
        boxShadow: "0 18px 48px rgba(0,0,0,0.22)",
      }}
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

const PAGE_LIMIT = 20

export function AdminView() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  useRequireAuth()

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [tab, setTab] = useState<"users" | "logs" | "analytics">("users")

  const [logs, setLogs] = useState<AdminLog[]>([])
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotalPages, setLogsTotalPages] = useState(1)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const [funnel, setFunnel] = useState<AdminFunnel | null>(null)
  const [retention, setRetention] = useState<AdminRetentionRow[]>([])
  const [paywallFunnel, setPaywallFunnel] = useState<AdminPaywallFunnel | null>(null)
  const [generationBudget, setGenerationBudget] = useState<AdminGenerationBudget | null>(null)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)

  const [grantingUserId, setGrantingUserId] = useState<number | null>(null)
  const [grantCredits, setGrantCredits] = useState("")
  const [grantTimecoin, setGrantTimecoin] = useState("")
  const [promoCredits, setPromoCredits] = useState("")
  const [promoExpiryDays, setPromoExpiryDays] = useState<"7" | "30">("7")
  const [grantReason, setGrantReason] = useState("")
  const [grantSubmitting, setGrantSubmitting] = useState(false)
  const [alphaRelease, setAlphaRelease] = useState<AlphaRelease | null>(null)
  const [alphaVersion, setAlphaVersion] = useState("")
  const [alphaNotes, setAlphaNotes] = useState("")
  const [alphaSubmitting, setAlphaSubmitting] = useState(false)

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      router.replace("/dashboard")
    }
  }, [authLoading, user, router])

  const loadStats = useCallback(async () => {
    try {
      const data = await apiClient.get<{ stats: AdminStats }>("/admin/stats", { skipAuthRedirect: true })
      setStats(data.stats)
    } catch {
      /* игнорируем — карточки просто не заполнятся */
    }
  }, [])

  const loadAlphaRelease = useCallback(async () => {
    try {
      const data = await apiClient.get<{ release: AlphaRelease | null }>("/admin/secret-room/alpha-release", { skipAuthRedirect: true })
      setAlphaRelease(data.release)
      if (data.release) {
        setAlphaVersion(data.release.version)
        setAlphaNotes(data.release.notes)
      }
    } catch {
      setAlphaRelease(null)
    }
  }, [])

  const loadUsers = useCallback(async (searchTerm: string, pageNum: number) => {
    setLoadingUsers(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_LIMIT) })
      if (searchTerm) params.set("search", searchTerm)
      const data = await apiClient.get<{ users: AdminUser[]; totalPages: number }>(
        `/admin/users?${params.toString()}`,
        { skipAuthRedirect: true },
      )
      setUsers(data.users)
      setTotalPages(data.totalPages)
    } catch {
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user?.role === "admin") {
      Promise.resolve().then(() => {
        loadStats()
        loadUsers(search, page)
        loadAlphaRelease()
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role, page, loadAlphaRelease])

  async function publishAlpha() {
    if (!alphaVersion.trim()) return
    setAlphaSubmitting(true)
    setActionError(null)
    try {
      const data = await apiClient.post<{ release: AlphaRelease }>("/admin/secret-room/alpha-release", { version: alphaVersion, notes: alphaNotes })
      setAlphaRelease(data.release)
    } catch (error: any) {
      setActionError(error?.message || "Не удалось опубликовать alpha-релиз")
    } finally {
      setAlphaSubmitting(false)
    }
  }

  const loadLogs = useCallback(async (pageNum: number) => {
    setLoadingLogs(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: "50" })
      const data = await apiClient.get<{ logs: AdminLog[]; totalPages: number }>(
        `/admin/logs?${params.toString()}`,
        { skipAuthRedirect: true },
      )
      setLogs(data.logs)
      setLogsTotalPages(data.totalPages)
    } catch {
      setLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user?.role === "admin" && tab === "logs") {
      Promise.resolve().then(() => loadLogs(logsPage))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role, tab, logsPage])

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true)
    try {
      const [funnelData, retentionData, paywallFunnelData, generationBudgetData] = await Promise.all([
        apiClient.get<{ funnel: AdminFunnel }>("/admin/analytics/funnel?days=30", { skipAuthRedirect: true }),
        apiClient.get<{ retention: AdminRetentionRow[] }>("/admin/analytics/retention?days=30", {
          skipAuthRedirect: true,
        }),
        apiClient.get<{ funnel: AdminPaywallFunnel }>("/admin/analytics/paywall-funnel?days=30", {
          skipAuthRedirect: true,
        }),
        apiClient.get<AdminGenerationBudget>("/admin/analytics/generation-budget", {
          skipAuthRedirect: true,
        }),
      ])
      setFunnel(funnelData.funnel)
      setRetention(retentionData.retention)
      setPaywallFunnel(paywallFunnelData.funnel)
      setGenerationBudget(generationBudgetData)
    } catch {
      setFunnel(null)
      setRetention([])
      setPaywallFunnel(null)
      setGenerationBudget(null)
    } finally {
      setLoadingAnalytics(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user?.role === "admin" && tab === "analytics") {
      Promise.resolve().then(() => loadAnalytics())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role, tab])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadUsers(search, 1)
  }

  const openGrant = (u: AdminUser) => {
    setActionError(null)
    setGrantCredits("")
    setGrantTimecoin("")
    setPromoCredits("")
    setPromoExpiryDays("7")
    setGrantReason("")
    setGrantingUserId((prev) => (prev === u.id ? null : u.id))
  }

  const submitGrant = async (userId: number) => {
    setActionError(null)
    const credits = grantCredits.trim() ? Number(grantCredits) : 0
    const timecoin = grantTimecoin.trim() ? Number(grantTimecoin) : 0

    if (Number.isNaN(credits) || Number.isNaN(timecoin) || (credits === 0 && timecoin === 0)) {
      setActionError("Укажите ненулевое значение credits и/или timecoin")
      return
    }

    setGrantSubmitting(true)
    try {
      await apiClient.patch(`/admin/users/${userId}/grant`, {
        credits,
        timecoin,
        reason: grantReason.trim() || undefined,
      })
      setGrantingUserId(null)
      setGrantCredits("")
      setGrantTimecoin("")
      setPromoCredits("")
      setGrantReason("")
      if (tab === "logs") loadLogs(logsPage)
    } catch (err: any) {
      setActionError(err?.message || "Не удалось выдать токены")
    } finally {
      setGrantSubmitting(false)
    }
  }

  const submitPromoGrant = async (userId: number) => {
    setActionError(null)
    const amount = Number(promoCredits)
    const reason = grantReason.trim()
    if (!Number.isFinite(amount) || amount <= 0) {
      setActionError("Укажите положительное число промо-кредитов")
      return
    }
    if (!reason) {
      setActionError("Укажите причину выдачи промо-кредитов")
      return
    }
    setGrantSubmitting(true)
    try {
      await apiClient.post(`/admin/users/${userId}/promo-credits`, { amount, reason, expiresInDays: Number(promoExpiryDays) })
      setGrantingUserId(null)
      setPromoCredits("")
      setGrantReason("")
      if (tab === "logs") loadLogs(logsPage)
    } catch (err: any) {
      setActionError(err?.message || "Не удалось выдать промо-кредиты")
    } finally {
      setGrantSubmitting(false)
    }
  }

  const toggleRole = async (u: AdminUser) => {
    setActionError(null)
    const nextRole = u.role === "admin" ? "user" : "admin"
    try {
      await apiClient.patch(`/admin/users/${u.id}/role`, { role: nextRole })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, role: nextRole } : x)))
    } catch (err: any) {
      setActionError(err?.message || "Не удалось изменить роль")
    }
  }

  const toggleBanned = async (u: AdminUser) => {
    setActionError(null)
    const nextBanned = !u.banned
    try {
      await apiClient.patch(`/admin/users/${u.id}/ban`, { banned: nextBanned })
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, banned: nextBanned } : x)))
    } catch (err: any) {
      setActionError(err?.message || "Не удалось изменить статус блокировки")
    }
  }

  if (authLoading || (user && user.role !== "admin")) {
    return (
      <div className="min-h-screen font-sans" style={{ background: "#10181d", color: "#FFFFFF" }}>
        <Navbar />
        <div className="flex items-center justify-center py-32" style={{ color: LABEL }}>
          Загрузка…
        </div>
      </div>
    )
  }

  const grantTarget = users.find((candidate) => candidate.id === grantingUserId) ?? null
  const statCards: { label: string; value: string | number; Icon: LucideIcon }[] = stats
    ? [
        { label: "Пользователей", value: stats.totalUsers, Icon: Users },
        { label: "Новых за 24ч", value: stats.newUsers24h, Icon: UserPlus },
        { label: "Проектов", value: stats.totalProjects, Icon: FolderKanban },
        { label: "Артефактов", value: stats.totalArtifacts, Icon: Gem },
        { label: "Транзакций за 24ч", value: stats.transactions24h, Icon: ActivityIcon },
        { label: "Credits в обороте", value: stats.totalCreditsInCirculation, Icon: Coins },
      ]
    : []

  return (
    <div
      className="min-h-screen font-sans"
      style={{
        backgroundColor: "#0a0a0a",
        backgroundImage: "linear-gradient(116deg, transparent 0 28%, rgba(215,174,87,0.045) 28.15% 28.28%, transparent 28.5% 100%), linear-gradient(24deg, transparent 0 74%, rgba(255,255,255,0.028) 74.15% 74.3%, transparent 74.5% 100%)",
        color: "#FFFFFF",
      }}
    >
      <Navbar />

      <main className="mx-auto max-w-6xl px-6 py-10 md:px-10">
        <header className="mb-8">
          <h1 className="text-[32px] font-semibold leading-tight">Админ-панель</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            Пользователи и статистика платформы
          </p>
        </header>

        {/* Stats */}
        <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {statCards.map((m) => (
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

        <Card className="mb-8">
          <SectionTitle Icon={Sparkles}>Alpha-доступ Secret Room</SectionTitle>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="block">
              <span className="mb-1 block text-[12px]" style={{ color: LABEL }}>Версия релиза</span>
              <input value={alphaVersion} onChange={(event) => setAlphaVersion(event.target.value)} placeholder="OSGARD 5.0 Alpha" className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#10181d", border: `1px solid ${BORDER}`, color: "#fff" }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px]" style={{ color: LABEL }}>Заметки для участников</span>
              <input value={alphaNotes} onChange={(event) => setAlphaNotes(event.target.value)} placeholder="Ранний доступ к новой версии" className="w-full rounded-lg px-3 py-2 text-[13px] outline-none" style={{ background: "#10181d", border: `1px solid ${BORDER}`, color: "#fff" }} />
            </label>
            <button type="button" onClick={publishAlpha} disabled={alphaSubmitting || !alphaVersion.trim()} className="self-end rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-40" style={{ background: ACCENT, color: "#10181d" }}>
              {alphaSubmitting ? "Публикация…" : "Опубликовать"}
            </button>
          </div>
          <p className="mt-3 text-[12px]" style={{ color: LABEL }}>
            {alphaRelease ? `Сейчас опубликовано: ${alphaRelease.version} · ${new Date(alphaRelease.publishedAt).toLocaleString("ru-RU")}` : "Alpha-релиз пока не опубликован."}
          </p>
        </Card>

        {/* Tabs */}
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("users")}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={
              tab === "users"
                ? { backgroundColor: "rgba(215, 174, 87,0.1)", border: `1px solid ${ACCENT}`, color: ACCENT }
                : { border: `1px solid ${BORDER}`, color: LABEL }
            }
          >
            <Users size={14} />
            Пользователи
          </button>
          <button
            type="button"
            onClick={() => setTab("logs")}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={
              tab === "logs"
                ? { backgroundColor: "rgba(215, 174, 87,0.1)", border: `1px solid ${ACCENT}`, color: ACCENT }
                : { border: `1px solid ${BORDER}`, color: LABEL }
            }
          >
            <ScrollText size={14} />
            Логи
          </button>
          <button
            type="button"
            onClick={() => setTab("analytics")}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={
              tab === "analytics"
                ? { backgroundColor: "rgba(215, 174, 87,0.1)", border: `1px solid ${ACCENT}`, color: ACCENT }
                : { border: `1px solid ${BORDER}`, color: LABEL }
            }
          >
            <TrendingUp size={14} />
            Аналитика
          </button>
        </div>

        {/* Users table */}
        {tab === "users" && (
        <Card>
          <SectionTitle Icon={Users}>Пользователи</SectionTitle>

          <form onSubmit={handleSearchSubmit} className="mb-5 flex items-center gap-3">
            <div
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: "#10181d" }}
            >
              <Search size={15} style={{ color: LABEL }} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по username или email…"
                className="w-full bg-transparent text-[13px] outline-none"
                style={{ color: "#FFFFFF" }}
              />
            </div>
            <button
              type="submit"
              className="rounded-lg px-4 py-2 text-[13px] font-medium"
              style={{ backgroundColor: ACCENT, color: "#10181d" }}
            >
              Найти
            </button>
          </form>

          {actionError && (
            <div className="mb-4 rounded-lg px-3 py-2 text-[13px]" style={{ border: "1px solid #e2685c", color: "#e2685c" }}>
              {actionError}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr style={{ color: LABEL }}>
                  <th className="pb-3 pr-4 font-medium">ID</th>
                  <th className="pb-3 pr-4 font-medium">Username</th>
                  <th className="pb-3 pr-4 font-medium">Email</th>
                  <th className="pb-3 pr-4 font-medium">Роль</th>
                  <th className="pb-3 pr-4 font-medium">Статус</th>
                  <th className="pb-3 pr-4 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: BORDER }}>
                {loadingUsers ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center" style={{ color: LABEL }}>
                      Загрузка…
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center" style={{ color: LABEL }}>
                      Пользователи не найдены
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <React.Fragment key={u.id}>
                    <tr>
                      <td className="py-3 pr-4" style={{ color: LABEL }}>{u.id}</td>
                      <td className="py-3 pr-4">{u.username}</td>
                      <td className="py-3 pr-4" style={{ color: "rgba(255,255,255,0.7)" }}>{u.email}</td>
                      <td className="py-3 pr-4">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={
                            u.role === "admin"
                              ? { backgroundColor: "rgba(215, 174, 87,0.1)", border: "1px solid rgba(215, 174, 87,0.3)", color: ACCENT }
                              : { border: `1px solid ${BORDER}`, color: LABEL }
                          }
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {u.banned ? (
                          <span className="text-[12px]" style={{ color: "#e2685c" }}>Заблокирован</span>
                        ) : (
                          <span className="text-[12px]" style={{ color: "#d7ae57" }}>Активен</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleRole(u)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px]"
                            style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                            title={u.role === "admin" ? "Снять admin" : "Сделать admin"}
                          >
                            {u.role === "admin" ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                            {u.role === "admin" ? "Снять admin" : "Сделать admin"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBanned(u)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px]"
                            style={{ border: `1px solid ${BORDER}`, color: u.banned ? "#d7ae57" : "#e2685c" }}
                            title={u.banned ? "Разбанить" : "Забанить"}
                          >
                            {u.banned ? <CheckCircle2 size={13} /> : <Ban size={13} />}
                            {u.banned ? "Разбанить" : "Забанить"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openGrant(u)}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px]"
                            style={
                              grantingUserId === u.id
                                ? { border: `1px solid ${ACCENT}`, color: ACCENT }
                                : { border: `1px solid ${BORDER}`, color: "#FFFFFF" }
                            }
                            title="Выдать токены"
                          >
                            <Gift size={13} />
                            Выдать
                          </button>
                        </div>
                      </td>
                    </tr>
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-40"
                style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
              >
                Назад
              </button>
              <span className="text-[12px]" style={{ color: LABEL }}>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-40"
                style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
              >
                Вперёд
              </button>
            </div>
          )}
        </Card>
        )}

        {/* Logs */}
        {tab === "logs" && (
          <Card>
            <SectionTitle Icon={ScrollText}>Журнал действий</SectionTitle>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr style={{ color: LABEL }}>
                    <th className="pb-3 pr-4 font-medium">Время</th>
                    <th className="pb-3 pr-4 font-medium">Админ</th>
                    <th className="pb-3 pr-4 font-medium">Действие</th>
                    <th className="pb-3 pr-4 font-medium">Цель</th>
                    <th className="pb-3 pr-4 font-medium">IP</th>
                    <th className="pb-3 pr-4 font-medium">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: BORDER }}>
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center" style={{ color: LABEL }}>
                        Загрузка…
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center" style={{ color: LABEL }}>
                        Записей пока нет
                      </td>
                    </tr>
                  ) : (
                    logs.map((l) => (
                      <tr key={l.id}>
                        <td className="py-3 pr-4" style={{ color: LABEL }}>
                          {new Date(l.createdAt).toLocaleString("ru-RU")}
                        </td>
                        <td className="py-3 pr-4">{l.admin.username}</td>
                        <td className="py-3 pr-4">
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{ backgroundColor: "rgba(215, 174, 87,0.1)", border: "1px solid rgba(215, 174, 87,0.3)", color: ACCENT }}
                          >
                            {ACTION_LABELS[l.action] || l.action}
                          </span>
                        </td>
                        <td className="py-3 pr-4" style={{ color: "rgba(255,255,255,0.7)" }}>
                          {l.target ? l.target.username : "—"}
                        </td>
                        <td className="py-3 pr-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                          <span title={l.userAgent ?? undefined}>{l.ip ?? "—"}</span>
                        </td>
                        <td className="py-3 pr-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {l.meta ? JSON.stringify(l.meta) : "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {logsTotalPages > 1 && (
              <div className="mt-5 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={logsPage <= 1}
                  onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-40"
                  style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                >
                  Назад
                </button>
                <span className="text-[12px]" style={{ color: LABEL }}>
                  {logsPage} / {logsTotalPages}
                </span>
                <button
                  type="button"
                  disabled={logsPage >= logsTotalPages}
                  onClick={() => setLogsPage((p) => Math.min(logsTotalPages, p + 1))}
                  className="rounded-lg px-3 py-1.5 text-[12px] disabled:opacity-40"
                  style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                >
                  Вперёд
                </button>
              </div>
            )}
          </Card>
        )}

        {/* Analytics */}
        {tab === "analytics" && (
          <div className="space-y-6">
            <Card>
              <SectionTitle Icon={Gauge}>Расход AI на генерацию приложений</SectionTitle>
              {loadingAnalytics ? (
                <div className="py-6 text-center text-[13px]" style={{ color: LABEL }}>
                  Загрузка...
                </div>
              ) : !generationBudget ? (
                <div className="py-6 text-center text-[13px]" style={{ color: LABEL }}>
                  Нет данных
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    {[
                      ["Токенов всего", generationBudget.usage.totalTokens],
                      ["Вызовов моделей", generationBudget.usage.calls],
                      ["Запусков", generationBudget.usage.runs],
                      ["Неуспешных попыток", generationBudget.usage.failed],
                    ].map(([label, value]) => (
                      <div key={String(label)}>
                        <div className="text-[24px] font-medium leading-none">
                          {new Intl.NumberFormat("ru-RU").format(Number(value))}
                        </div>
                        <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {label}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]" style={{ color: "rgba(255,255,255,0.64)" }}>
                    <span>Рассчитанная себестоимость: <strong style={{ color: "rgba(255,255,255,0.9)" }}>${generationBudget.usage.pricedUsd.toFixed(4)}</strong></span>
                    <span>Покрыто тарифами: {generationBudget.usage.pricedCalls} вызовов</span>
                    {generationBudget.usage.unpricedCalls > 0 ? <span style={{ color: "#f4bc5a" }}>Без тарифа: {generationBudget.usage.unpricedCalls} вызовов</span> : null}
                    {generationBudget.usage.estimatedCostCalls > 0 ? <span style={{ color: "#f4bc5a" }}>Оцененных по токенам: {generationBudget.usage.estimatedCostCalls}</span> : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {Object.entries(generationBudget.usage.byProvider).map(([provider, usage]) => (
                      <span
                        key={provider}
                        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px]"
                        style={{ border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.72)" }}
                      >
                        <span style={{ color: ACCENT }}>{displayAiModelName(provider)}</span>
                        {new Intl.NumberFormat("ru-RU").format(usage.tokens)} токенов / {usage.calls} вызовов
                      </span>
                    ))}
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr style={{ color: LABEL }}>
                          <th className="pb-3 pr-4 font-medium">Профиль</th>
                          <th className="pb-3 pr-4 font-medium">Замеров</th>
                          <th className="pb-3 pr-4 font-medium">P95</th>
                          <th className="pb-3 pr-4 font-medium">Лимит на запуск</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: BORDER }}>
                        {(
                          [
                            ["Quick / шаблон", "quickTemplate"],
                            ["Quick / AI", "quickAi"],
                            ["Standard / AI", "standardAi"],
                            ["Deep / AI", "deepAi"],
                            ["Вся платформа", "platform"],
                          ] as const
                        ).map(([label, key]) => {
                          const row = generationBudget.recommendations[key]
                          return (
                            <tr key={key}>
                              <td className="py-3 pr-4">{label}</td>
                              <td className="py-3 pr-4" style={{ color: LABEL }}>{row.samples}</td>
                              <td className="py-3 pr-4">
                                {row.limit ? new Intl.NumberFormat("ru-RU").format(row.limit.p95) : "-"}
                              </td>
                              <td className="py-3 pr-4" style={{ color: row.limit ? ACCENT : LABEL }}>
                                {row.limit
                                  ? new Intl.NumberFormat("ru-RU").format(row.limit.recommended)
                                  : `Нужно ${generationBudget.methodology.minimumSamples} замеров`}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card>
              <SectionTitle Icon={TrendingUp}>Воронка за 30 дней</SectionTitle>
              {loadingAnalytics ? (
                <div className="py-6 text-center text-[13px]" style={{ color: LABEL }}>
                  Загрузка…
                </div>
              ) : !funnel ? (
                <div className="py-6 text-center text-[13px]" style={{ color: LABEL }}>
                  Нет данных
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  <div>
                    <div className="text-[24px] font-medium leading-none">{funnel.registered}</div>
                    <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Регистраций
                    </div>
                  </div>
                  <div>
                    <div className="text-[24px] font-medium leading-none">{funnel.activated}</div>
                    <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Активировались (1-я генерация)
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: ACCENT }}>
                      {(funnel.activationRate * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-[24px] font-medium leading-none">{funnel.paid}</div>
                    <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                      Оформили платный тариф
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: ACCENT }}>
                      {(funnel.paidConversionRate * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <SectionTitle Icon={ActivityIcon}>Retention по когортам (D1 / D7 / D30)</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr style={{ color: LABEL }}>
                      <th className="pb-3 pr-4 font-medium">Когорта (день регистрации)</th>
                      <th className="pb-3 pr-4 font-medium">Размер</th>
                      <th className="pb-3 pr-4 font-medium">D1</th>
                      <th className="pb-3 pr-4 font-medium">D7</th>
                      <th className="pb-3 pr-4 font-medium">D30</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: BORDER }}>
                    {loadingAnalytics ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center" style={{ color: LABEL }}>
                          Загрузка…
                        </td>
                      </tr>
                    ) : retention.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center" style={{ color: LABEL }}>
                          Нет данных
                        </td>
                      </tr>
                    ) : (
                      retention.map((r) => (
                        <tr key={r.cohortDay}>
                          <td className="py-3 pr-4" style={{ color: LABEL }}>{r.cohortDay}</td>
                          <td className="py-3 pr-4">{r.cohortSize}</td>
                          <td className="py-3 pr-4">
                            {r.cohortSize > 0 ? `${r.d1} (${((r.d1 / r.cohortSize) * 100).toFixed(0)}%)` : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            {r.cohortSize > 0 ? `${r.d7} (${((r.d7 / r.cohortSize) * 100).toFixed(0)}%)` : "—"}
                          </td>
                          <td className="py-3 pr-4">
                            {r.cohortSize > 0 ? `${r.d30} (${((r.d30 / r.cohortSize) * 100).toFixed(0)}%)` : "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card>
              <SectionTitle Icon={CreditCard}>Воронка paywall за {paywallFunnel?.days ?? 30} дней</SectionTitle>
              {loadingAnalytics ? (
                <div className="py-6 text-center text-[13px]" style={{ color: LABEL }}>
                  Загрузка…
                </div>
              ) : !paywallFunnel ? (
                <div className="py-6 text-center text-[13px]" style={{ color: LABEL }}>
                  Нет данных
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <div>
                      <div className="text-[24px] font-medium leading-none">{paywallFunnel.totalViews}</div>
                      <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Просмотров pricing
                      </div>
                    </div>
                    <div>
                      <div className="text-[24px] font-medium leading-none">{paywallFunnel.totalClicks}</div>
                      <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Кликов по тарифу
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: ACCENT }}>
                        {(paywallFunnel.viewToClickRate * 100).toFixed(1)}% от просмотров
                      </div>
                    </div>
                    <div>
                      <div className="text-[24px] font-medium leading-none">{paywallFunnel.totalConversions}</div>
                      <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Оплатили
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: ACCENT }}>
                        {(paywallFunnel.clickToConversionRate * 100).toFixed(1)}% от кликов ·{" "}
                        {(paywallFunnel.overallConversionRate * 100).toFixed(1)}% всего
                      </div>
                    </div>
                    <div>
                      <div className="text-[24px] font-medium leading-none">{paywallFunnel.totalAbandons}</div>
                      <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Ушли без выбора тарифа
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[13px]" style={{ color: LABEL }}>
                        Популярнее всего
                      </div>
                      <div className="mt-1 text-[15px] font-medium">{paywallFunnel.mostPopularTier ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[13px]" style={{ color: LABEL }}>
                        Среднее время принятия решения
                      </div>
                      <div className="mt-1 text-[15px] font-medium">{paywallFunnel.avgDecisionTimeSec} сек</div>
                    </div>
                  </div>

                  <div className="mt-5 overflow-x-auto">
                    <table className="w-full text-left text-[13px]">
                      <thead>
                        <tr style={{ color: LABEL }}>
                          <th className="pb-3 pr-4 font-medium">Тариф</th>
                          <th className="pb-3 pr-4 font-medium">Клики</th>
                          <th className="pb-3 pr-4 font-medium">Оплатили</th>
                          <th className="pb-3 pr-4 font-medium">Не оплатили</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y" style={{ borderColor: BORDER }}>
                        {paywallFunnel.byTier.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-6 text-center" style={{ color: LABEL }}>
                              Нет данных
                            </td>
                          </tr>
                        ) : (
                          paywallFunnel.byTier.map((t) => (
                            <tr key={t.tier}>
                              <td className="py-3 pr-4" style={{ color: LABEL }}>{t.tier}</td>
                              <td className="py-3 pr-4">{t.clicks}</td>
                              <td className="py-3 pr-4">{t.conversions}</td>
                              <td className="py-3 pr-4">{t.notConverted}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>
          </div>
        )}
      </main>
      {grantTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 px-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !grantSubmitting) setGrantingUserId(null) }}>
          <section className="w-full max-w-lg rounded-lg p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="grant-dialog-title" style={{ background: "#10181d", border: `1px solid ${ACCENT}66` }}>
            <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: ACCENT }}>Выдача кредитов</p>
            <h2 id="grant-dialog-title" className="mt-1 text-[22px] font-medium">{grantTarget.username}</h2>
            <p className="mt-1 text-[13px]" style={{ color: LABEL }}>{grantTarget.email}</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <label><span className="mb-1 block text-[12px]" style={{ color: LABEL }}>Credits</span><input type="number" min="0" value={grantCredits} onChange={(event) => setGrantCredits(event.target.value)} className="w-full rounded-lg px-3 py-2 text-[14px] outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: "#fff" }} /></label>
              <label><span className="mb-1 block text-[12px]" style={{ color: LABEL }}>TimeCoin</span><input type="number" min="0" value={grantTimecoin} onChange={(event) => setGrantTimecoin(event.target.value)} className="w-full rounded-lg px-3 py-2 text-[14px] outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: "#fff" }} /></label>
            </div>
            <div className="mt-4 border-t pt-4" style={{ borderColor: BORDER }}>
              <div className="grid grid-cols-[1fr_auto] gap-3"><label><span className="mb-1 block text-[12px]" style={{ color: ACCENT }}>Promo credits</span><input type="number" min="1" value={promoCredits} onChange={(event) => setPromoCredits(event.target.value)} className="w-full rounded-lg px-3 py-2 text-[14px] outline-none" style={{ background: CARD, border: `1px solid ${ACCENT}66`, color: "#fff" }} /></label><label><span className="mb-1 block text-[12px]" style={{ color: LABEL }}>Срок</span><select value={promoExpiryDays} onChange={(event) => setPromoExpiryDays(event.target.value as "7" | "30")} className="rounded-lg px-3 py-2 text-[14px] outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: "#fff" }}><option value="7">7 дней</option><option value="30">30 дней</option></select></label></div>
              <label className="mt-3 block"><span className="mb-1 block text-[12px]" style={{ color: LABEL }}>Основание операции</span><select value={grantReason} onChange={(event) => setGrantReason(event.target.value)} className="w-full rounded-lg px-3 py-2 text-[14px] outline-none" style={{ background: CARD, border: `1px solid ${BORDER}`, color: "#fff" }}><option value="">Выберите основание</option><option value="Bug report">Баг-репорт</option><option value="Promo campaign">Промо-акция</option><option value="Compensation">Компенсация</option><option value="Event">Ивент</option></select></label>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => setGrantingUserId(null)} disabled={grantSubmitting} className="rounded-lg px-4 py-2 text-[13px]" style={{ border: `1px solid ${BORDER}`, color: "#fff" }}>Отмена</button><button type="button" onClick={() => submitGrant(grantTarget.id)} disabled={grantSubmitting || (!grantCredits.trim() && !grantTimecoin.trim())} className="rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-40" style={{ background: ACCENT, color: "#10181d" }}>Выдать баланс</button><button type="button" onClick={() => submitPromoGrant(grantTarget.id)} disabled={grantSubmitting || !promoCredits.trim() || !grantReason} className="rounded-lg px-4 py-2 text-[13px] font-medium disabled:opacity-40" style={{ border: `1px solid ${ACCENT}`, color: ACCENT }}>Выдать promo</button></div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
