"use client"

import React, { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { DollarSign, Users, TrendingDown, Download, CreditCard, type LucideIcon } from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient, API_BASE_URL } from "@/lib/api-client"
import { useAuth, useRequireAuth } from "@/lib/auth-store"

/* Палитра — как в components/admin-view.tsx (единый стиль admin-раздела). */
const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"

type BillingSummary = {
  totalRevenue: number
  revenueByType: { type: string; total: number }[]
  activeSubscriptions: number
  activeByPlan: { plan: string; count: number }[]
  churnRate: number
  canceledLast30d: number
  failedPayments30d: number
  recentTransactions: {
    id: number
    userId: number
    username: string | null
    type: string
    item: string | null
    amount: number
    status: string
    createdAt: number
  }[]
}

const PLAN_LABELS: Record<string, string> = {
  pro: "Pro",
  supreme: "Supreme",
  duo: "Duo",
  elite: "Elite",
  free: "Free",
}

const TYPE_LABELS: Record<string, string> = {
  subscription: "Подписки",
  purchase: "Докупки",
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl p-6 ${className}`} style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
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

function StatCard({ label, value, Icon }: { label: string; value: string; Icon: LucideIcon }) {
  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} strokeWidth={1.75} style={{ color: ACCENT }} />
        <span className="text-[12px] uppercase tracking-[0.1em]" style={{ color: LABEL }}>
          {label}
        </span>
      </div>
      <div className="text-2xl font-semibold" style={{ color: "#FFFFFF" }}>
        {value}
      </div>
    </Card>
  )
}

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function BillingDashboardView() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  useRequireAuth()

  const [summary, setSummary] = useState<BillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      router.replace("/dashboard")
    }
  }, [authLoading, user, router])

  const loadSummary = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiClient.get<BillingSummary>("/billing-dashboard/summary", { skipAuthRedirect: true })
      setSummary(data)
      setError(null)
    } catch {
      setError("Не удалось загрузить данные по платежам")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && user?.role === "admin") {
      loadSummary()
    }
  }, [authLoading, user?.role, loadSummary])

  const handleExportCsv = () => {
    window.open(`${API_BASE_URL}/billing-dashboard/export.csv`, "_blank")
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0A0A0F" }}>
      <Navbar />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-xl font-semibold" style={{ color: "#FFFFFF" }}>
            Платежи и подписки
          </h1>
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-medium"
            style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, color: ACCENT }}
          >
            <Download size={14} strokeWidth={2} />
            Экспорт CSV
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-32" style={{ color: LABEL }}>
            Загрузка…
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center" style={{ color: LABEL }}>
            {error}
          </div>
        )}

        {!loading && !error && summary && (
          <>
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StatCard label="Общая выручка" value={formatUsd(summary.totalRevenue)} Icon={DollarSign} />
              <StatCard label="Активные подписки" value={String(summary.activeSubscriptions)} Icon={Users} />
              <StatCard label="Churn rate (30 дн.)" value={`${summary.churnRate}%`} Icon={TrendingDown} />
            </div>

            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Card>
                <SectionTitle Icon={Users}>По тарифам</SectionTitle>
                {summary.activeByPlan.length === 0 ? (
                  <p className="text-[13px]" style={{ color: LABEL }}>
                    Нет активных подписок
                  </p>
                ) : (
                  <div className="space-y-2">
                    {summary.activeByPlan.map((row) => (
                      <div key={row.plan} className="flex items-center justify-between text-[13px]">
                        <span style={{ color: "#FFFFFF" }}>{PLAN_LABELS[row.plan] ?? row.plan}</span>
                        <span style={{ color: LABEL }}>{row.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card>
                <SectionTitle Icon={DollarSign}>Выручка по типу</SectionTitle>
                {summary.revenueByType.length === 0 ? (
                  <p className="text-[13px]" style={{ color: LABEL }}>
                    Нет данных
                  </p>
                ) : (
                  <div className="space-y-2">
                    {summary.revenueByType.map((row) => (
                      <div key={row.type} className="flex items-center justify-between text-[13px]">
                        <span style={{ color: "#FFFFFF" }}>{TYPE_LABELS[row.type] ?? row.type}</span>
                        <span style={{ color: LABEL }}>{formatUsd(row.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[12px]" style={{ color: LABEL }}>
                  Отклонённых платежей за 30 дн.: {summary.failedPayments30d} · Отмен за 30 дн.:{" "}
                  {summary.canceledLast30d}
                </p>
              </Card>
            </div>

            <Card>
              <SectionTitle Icon={CreditCard}>Последние транзакции</SectionTitle>
              {summary.recentTransactions.length === 0 ? (
                <p className="text-[13px]" style={{ color: LABEL }}>
                  Транзакций пока нет
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr style={{ color: LABEL }}>
                        <th className="pb-2 pr-4 font-normal">Пользователь</th>
                        <th className="pb-2 pr-4 font-normal">Тип</th>
                        <th className="pb-2 pr-4 font-normal">Описание</th>
                        <th className="pb-2 pr-4 font-normal">Сумма</th>
                        <th className="pb-2 font-normal">Статус</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recentTransactions.map((tx) => (
                        <tr key={tx.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td className="py-2 pr-4" style={{ color: "#FFFFFF" }}>
                            {tx.username ?? tx.userId}
                          </td>
                          <td className="py-2 pr-4" style={{ color: LABEL }}>
                            {TYPE_LABELS[tx.type] ?? tx.type}
                          </td>
                          <td className="py-2 pr-4" style={{ color: LABEL }}>
                            {tx.item ?? "—"}
                          </td>
                          <td className="py-2 pr-4" style={{ color: "#FFFFFF" }}>
                            {formatUsd(tx.amount)}
                          </td>
                          <td className="py-2" style={{ color: tx.status === "failed" ? "#FF5C5C" : LABEL }}>
                            {tx.status}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
