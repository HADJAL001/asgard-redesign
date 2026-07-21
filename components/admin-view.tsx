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
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { useAuth, useRequireAuth } from "@/lib/auth-store"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */
const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"

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
  createdAt: number
  admin: { id: number; username: string }
  target: { id: number; username: string } | null
}

const ACTION_LABELS: Record<string, string> = {
  set_role: "Изменение роли",
  set_banned: "Изменение блокировки",
  grant_tokens: "Выдача токенов",
}

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
  const [tab, setTab] = useState<"users" | "logs">("users")

  const [logs, setLogs] = useState<AdminLog[]>([])
  const [logsPage, setLogsPage] = useState(1)
  const [logsTotalPages, setLogsTotalPages] = useState(1)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const [grantingUserId, setGrantingUserId] = useState<number | null>(null)
  const [grantCredits, setGrantCredits] = useState("")
  const [grantTimecoin, setGrantTimecoin] = useState("")
  const [grantReason, setGrantReason] = useState("")
  const [grantSubmitting, setGrantSubmitting] = useState(false)

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      router.replace("/dashboard")
    }
  }, [authLoading, user, router])

  const loadStats = useCallback(async () => {
    try {
      const data = await apiClient.get<{ stats: AdminStats }>("/admin/stats")
      setStats(data.stats)
    } catch {
      /* игнорируем — карточки просто не заполнятся */
    }
  }, [])

  const loadUsers = useCallback(async (searchTerm: string, pageNum: number) => {
    setLoadingUsers(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_LIMIT) })
      if (searchTerm) params.set("search", searchTerm)
      const data = await apiClient.get<{ users: AdminUser[]; totalPages: number }>(
        `/admin/users?${params.toString()}`,
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
      loadStats()
      loadUsers(search, page)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role, page])

  const loadLogs = useCallback(async (pageNum: number) => {
    setLoadingLogs(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: "50" })
      const data = await apiClient.get<{ logs: AdminLog[]; totalPages: number }>(
        `/admin/logs?${params.toString()}`,
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
      loadLogs(logsPage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user?.role, tab, logsPage])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    loadUsers(search, 1)
  }

  const openGrant = (u: AdminUser) => {
    setActionError(null)
    setGrantCredits("")
    setGrantTimecoin("")
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
      setGrantReason("")
      if (tab === "logs") loadLogs(logsPage)
    } catch (err: any) {
      setActionError(err?.message || "Не удалось выдать токены")
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
      <div className="min-h-screen font-sans" style={{ background: "#0A0A0F", color: "#FFFFFF" }}>
        <Navbar />
        <div className="flex items-center justify-center py-32" style={{ color: LABEL }}>
          Загрузка…
        </div>
      </div>
    )
  }

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
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: "#FFFFFF" }}
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

        {/* Tabs */}
        <div className="mb-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setTab("users")}
            className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors"
            style={
              tab === "users"
                ? { backgroundColor: "rgba(0,212,255,0.1)", border: `1px solid ${ACCENT}`, color: ACCENT }
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
                ? { backgroundColor: "rgba(0,212,255,0.1)", border: `1px solid ${ACCENT}`, color: ACCENT }
                : { border: `1px solid ${BORDER}`, color: LABEL }
            }
          >
            <ScrollText size={14} />
            Логи
          </button>
        </div>

        {/* Users table */}
        {tab === "users" && (
        <Card>
          <SectionTitle Icon={Users}>Пользователи</SectionTitle>

          <form onSubmit={handleSearchSubmit} className="mb-5 flex items-center gap-3">
            <div
              className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: "#0A0A0F" }}
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
              style={{ backgroundColor: ACCENT, color: "#0A0A0F" }}
            >
              Найти
            </button>
          </form>

          {actionError && (
            <div className="mb-4 rounded-lg px-3 py-2 text-[13px]" style={{ border: "1px solid #F87171", color: "#F87171" }}>
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
                              ? { backgroundColor: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: ACCENT }
                              : { border: `1px solid ${BORDER}`, color: LABEL }
                          }
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        {u.banned ? (
                          <span className="text-[12px]" style={{ color: "#F87171" }}>Заблокирован</span>
                        ) : (
                          <span className="text-[12px]" style={{ color: "#4ADE80" }}>Активен</span>
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
                            style={{ border: `1px solid ${BORDER}`, color: u.banned ? "#4ADE80" : "#F87171" }}
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
                    {grantingUserId === u.id && (
                      <tr>
                        <td colSpan={6} className="pb-4">
                          <div
                            className="flex flex-wrap items-end gap-3 rounded-lg p-4"
                            style={{ border: `1px solid ${BORDER}`, backgroundColor: "#0A0A0F" }}
                          >
                            <label className="block">
                              <span className="mb-1 block text-[11px]" style={{ color: LABEL }}>Credits</span>
                              <input
                                type="number"
                                value={grantCredits}
                                onChange={(e) => setGrantCredits(e.target.value)}
                                placeholder="0"
                                className="w-28 rounded-lg px-3 py-1.5 text-[13px] outline-none"
                                style={{ backgroundColor: "#14141E", border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                              />
                            </label>
                            <label className="block">
                              <span className="mb-1 block text-[11px]" style={{ color: LABEL }}>TimeCoin</span>
                              <input
                                type="number"
                                value={grantTimecoin}
                                onChange={(e) => setGrantTimecoin(e.target.value)}
                                placeholder="0"
                                className="w-28 rounded-lg px-3 py-1.5 text-[13px] outline-none"
                                style={{ backgroundColor: "#14141E", border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                              />
                            </label>
                            <label className="block flex-1 min-w-[180px]">
                              <span className="mb-1 block text-[11px]" style={{ color: LABEL }}>Причина</span>
                              <input
                                type="text"
                                value={grantReason}
                                onChange={(e) => setGrantReason(e.target.value)}
                                placeholder="Необязательно"
                                className="w-full rounded-lg px-3 py-1.5 text-[13px] outline-none"
                                style={{ backgroundColor: "#14141E", border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => submitGrant(u.id)}
                              disabled={grantSubmitting}
                              className="rounded-lg px-4 py-1.5 text-[13px] font-medium disabled:opacity-50"
                              style={{ backgroundColor: ACCENT, color: "#0A0A0F" }}
                            >
                              Выдать
                            </button>
                            <button
                              type="button"
                              onClick={() => setGrantingUserId(null)}
                              className="rounded-lg px-4 py-1.5 text-[13px]"
                              style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                            >
                              Отмена
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
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
                    <th className="pb-3 pr-4 font-medium">Детали</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: BORDER }}>
                  {loadingLogs ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center" style={{ color: LABEL }}>
                        Загрузка…
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center" style={{ color: LABEL }}>
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
                            style={{ backgroundColor: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: ACCENT }}
                          >
                            {ACTION_LABELS[l.action] || l.action}
                          </span>
                        </td>
                        <td className="py-3 pr-4" style={{ color: "rgba(255,255,255,0.7)" }}>
                          {l.target ? l.target.username : "—"}
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
      </main>
    </div>
  )
}
