"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  FolderKanban,
  Gem,
  Coins,
  TrendingUp,
  Circle,
  Wand2,
  MessageCircle,
  Plus,
  Mic,
  Zap,
  Loader2,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { OnboardingTutorial } from "./OnboardingTutorial"
import { apiClient } from "@/lib/api-client"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { formatTokens, badgeIcon } from "@/lib/economy"
import { fmtTC } from "@/lib/tc-market"


/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */
const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"
const GREEN = "#4ADE80"
const YELLOW = "#FFD54A"
const RED = "#FF5C5C"

/** Форматирует timestamp (мс) в "12 июля 2026" — как на карточках проектов. */
function formatProjectDate(ts: number): string {
  return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
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

export function DashboardView() {
  const router = useRouter()
  const [onboardingStep, setOnboardingStep] = useState<number | null>(null)

  /* Реальные данные аккаунта — тот же источник, что используют /projects и /wallet
     (useOsgardStore → GET /projects/mine и GET /wallet). Никаких моков. */
  const { projects, wallet, fetchProjects, fetchWallet } = useOsgardStore()
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await Promise.all([
        fetchProjects({ skipAuthRedirect: true }),
        fetchWallet({ skipAuthRedirect: true }),
      ])
      if (!cancelled) setDataLoading(false)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalArtifacts = useMemo(() => projects.reduce((s, p) => s + p.artifactCount, 0), [projects])
  const totalIncome = useMemo(() => projects.reduce((s, p) => s + p.income, 0), [projects])

  const recentProjects = useMemo(
    () => [...projects].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5),
    [projects],
  )

  const METRICS: { label: string; value: string; Icon: LucideIcon }[] = [
    { label: "Проектов", value: `${projects.length}`, Icon: FolderKanban },
    { label: "Артефактов", value: `${totalArtifacts}`, Icon: Gem },
    { label: "Токенов", value: formatTokens(wallet.credits), Icon: Coins },
    { label: "Доход", value: fmtTC(totalIncome), Icon: TrendingUp },
  ]

  /* Проверяем прогресс онбординга при монтировании дашборда.
     Логика:
     1. Если localStorage "osgard_onboarding_done" === "1" → не показываем
     2. Иначе пробуем бэкенд; если бэкенд недоступен — показываем с шага 0
     3. После завершения помечаем в localStorage */
  useEffect(() => {
    let cancelled = false

    ;(async () => {
      try {
        const data = await apiClient.get<{ currentStep: number; completed: boolean }>(
          "/onboarding/status",
          { skipAuthRedirect: true },
        )
        if (!cancelled) {
          if (data.completed) {
            setOnboardingStep(null)
          } else {
            setOnboardingStep(data.currentStep)
          }
        }
      } catch {
        /* бэкенд недоступен — показываем онбординг с нуля для новых пользователей */
        if (!cancelled) setOnboardingStep(0)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)", color: "#FFFFFF" }}>
      <Navbar />

      {onboardingStep !== null && (
        <OnboardingTutorial
          initialStep={onboardingStep}
          onFinish={() => setOnboardingStep(null)}
        />
      )}


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

        {/* Последние проекты — реальные данные из useOsgardStore (GET /projects/mine) */}
        <section className="mb-6">
          <Card>
            <SectionTitle Icon={FolderKanban}>Последние проекты</SectionTitle>

            {dataLoading && projects.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <Loader2 size={24} className="animate-spin" style={{ color: ACCENT }} />
                <p className="text-[13px]" style={{ color: LABEL }}>Загрузка проектов…</p>
              </div>
            ) : recentProjects.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-[14px]" style={{ color: LABEL }}>У вас пока нет проектов</p>
                <button
                  type="button"
                  onClick={() => router.push("/projects")}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-medium transition-colors"
                  style={{ border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                >
                  <Plus size={16} strokeWidth={1.75} />
                  Создать проект
                </button>
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: BORDER }}>
                {recentProjects.map((p) => {
                  const BadgeIcon = badgeIcon(p.badge)
                  let statusLabel = "Готов"
                  let statusColor = GREEN
                  if (p.status === "generating") {
                    statusLabel = "Генерируется"
                    statusColor = YELLOW
                  } else if (p.status === "failed") {
                    statusLabel = "Ошибка"
                    statusColor = RED
                  } else if (p.deployStatus === "deploying") {
                    statusLabel = "Деплой…"
                    statusColor = YELLOW
                  } else if (p.deployStatus === "deployed") {
                    statusLabel = "Задеплоен"
                    statusColor = GREEN
                  } else if (p.deployStatus === "failed") {
                    statusLabel = "Ошибка деплоя"
                    statusColor = RED
                  }
                  return (
                    <li
                      key={p.id}
                      onClick={() => router.push(`/projects/${p.id}`)}
                      className="flex cursor-pointer items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${BORDER}` }}>
                          <BadgeIcon size={16} strokeWidth={1.5} style={{ color: ACCENT }} />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-[14px]">{p.name}</div>
                          <div className="mt-1 text-[12px]" style={{ color: LABEL }}>
                            {formatProjectDate(p.createdAt)}
                          </div>
                        </div>
                      </div>
                      <span className="ml-3 flex shrink-0 items-center gap-2">
                        <Circle size={8} fill={statusColor} strokeWidth={0} />
                        <span className="text-[12px]" style={{ color: statusColor }}>
                          {statusLabel}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </section>

        {/* Walli AI companion widget */}
        <section className="mb-6">
          <div
            className="relative overflow-hidden rounded-xl p-6"
            style={{
              backgroundColor: CARD,
              border: `1px solid #1A2A3E`,
              background: `linear-gradient(135deg, #0D1A2A 0%, #14141E 50%, #0A1020 100%)`,
            }}
          >
            {/* Glow effect */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl"
              style={{
                background: "radial-gradient(ellipse 60% 50% at 15% 50%, rgba(0,212,255,0.08) 0%, transparent 70%)",
              }}
            />

            <div className="relative flex flex-col gap-6 md:flex-row md:items-center">
              {/* Avatar */}
              <div className="flex shrink-0 items-center justify-center">
                <div
                  className="relative flex size-20 items-center justify-center rounded-full"
                  style={{
                    border: "2px solid rgba(0,212,255,0.4)",
                    background: "radial-gradient(circle at 35% 35%, #1A3A4A, #0A1A2A)",
                    boxShadow: "0 0 32px rgba(0,212,255,0.25), inset 0 0 20px rgba(0,212,255,0.08)",
                  }}
                >
                  <span className="text-3xl select-none">🤖</span>
                  {/* Pulse ring */}
                  <span
                    className="absolute inset-0 rounded-full animate-ping"
                    style={{
                      border: "1px solid rgba(0,212,255,0.3)",
                      animationDuration: "3s",
                    }}
                  />
                </div>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[18px] font-semibold tracking-wide" style={{ color: ACCENT }}>
                    W A L L I
                  </h3>
                  <span
                    className="flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)", color: ACCENT }}
                  >
                    <span
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: "#4ADE80", boxShadow: "0 0 6px #4ADE80" }}
                    />
                    Online
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Ваш цифровой компаньон на базе ИИ. Помогает с проектами, отвечает на вопросы и анализирует данные платформы.
                </p>

                {/* Stats row */}
                <div className="mt-3 flex flex-wrap gap-4">
                  {[
                    { icon: Zap, label: "Режим", value: "AI-помощник" },
                    { icon: Mic, label: "Голосовой режим", value: "Активен" },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <Icon size={13} style={{ color: ACCENT }} />
                      <span className="text-[12px]" style={{ color: LABEL }}>{label}:</span>
                      <span className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => router.push("/walli-room")}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[13px] font-semibold transition-all duration-200"
                  style={{
                    backgroundColor: "rgba(0,212,255,0.12)",
                    border: "1px solid rgba(0,212,255,0.4)",
                    color: ACCENT,
                    boxShadow: "0 0 16px rgba(0,212,255,0.12)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(0,212,255,0.22)"
                    e.currentTarget.style.boxShadow = "0 0 24px rgba(0,212,255,0.28)"
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(0,212,255,0.12)"
                    e.currentTarget.style.boxShadow = "0 0 16px rgba(0,212,255,0.12)"
                  }}
                >
                  <MessageCircle size={15} />
                  Открыть Валли
                </button>
              </div>
            </div>
          </div>
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
