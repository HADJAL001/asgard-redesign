"use client"

/* ================================================================
   UpgradeNudgeModal — модалка апгрейда после 3 AI-генераций
   ----------------------------------------------------------------
   Показывается авторизованным free-пользователям после того, как
   они сделали UPGRADE_THRESHOLD генераций за сессию. Цель —
   усилить IKEA-эффект: пользователь уже вложил время → покажи
   что он теряет без подписки.

   Использование:
     <UpgradeNudgeModal
       open={nudgeOpen}
       onClose={() => setNudgeOpen(false)}
       generationsToday={used}   // сколько использовано сегодня
       limit={limit}             // дневной лимит (5 для free)
     />

   Или используй хук useUpgradeNudge() — он автоматически
   считает генерации и управляет open-состоянием.
   ================================================================ */

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Crown, Zap, Sparkles, GitBranch, ArrowRight } from "lucide-react"
import { PremiumModal } from "./PremiumModal"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

/* ── Порог: после скольки генераций показывать нудж ── */
export const UPGRADE_NUDGE_THRESHOLD = 3

/* ── Преимущества апгрейда ── */
const PERKS = [
  {
    Icon: Zap,
    color: "#A855F7",
    glow: "rgba(168,85,247,0.15)",
    title: "Pro — $29/мес",
    desc: "20 генераций проектов/день",
  },
  {
    Icon: Crown,
    color: "#F59E0B",
    glow: "rgba(245,158,11,0.15)",
    title: "Supreme — $99/мес",
    desc: "Оркестратор: 10 OS 5.0 + 10 OS 3.3 + 10 OS 3.0/мес",
  },
  {
    Icon: Sparkles,
    color: "#06B6D4",
    glow: "rgba(6,182,212,0.15)",
    title: "7 дней бесплатно",
    desc: "Триал без ввода карты — активируется сразу",
  },
  {
    Icon: GitBranch,
    color: "#34D399",
    glow: "rgba(52,211,153,0.15)",
    title: "Оркестратор AI-цепочек",
    desc: "OS 5.0 → OS 3.3 → OS 3.0 в одном пайплайне",
  },
]

interface UpgradeNudgeModalProps {
  open: boolean
  onClose: () => void
  generationsToday: number
  limit: number
}

export function UpgradeNudgeModal({
  open,
  onClose,
  generationsToday,
  limit,
}: UpgradeNudgeModalProps) {
  const remaining = Math.max(0, limit - generationsToday)

  return (
    <PremiumModal
      open={open}
      onClose={onClose}
      maxWidth="md"
      hideClose={false}
      icon={<Crown size={20} style={{ color: "#A855F7" }} />}
      title={
        remaining === 0
          ? "Дневной лимит исчерпан"
          : `Ты использовал ${generationsToday} из ${limit} генераций`
      }
      subtitle={
        remaining === 0
          ? "Обнови тариф, чтобы продолжать генерировать прямо сейчас"
          : `Осталось ${remaining} — апгрейд даст тебе в 3× больше уже сегодня`
      }
    >
      <div className="space-y-5">
        {/* Прогресс-бар использования */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "rgba(168,85,247,0.04)",
            border: "1px solid rgba(168,85,247,0.15)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              Генерации сегодня
            </span>
            <span className="text-[13px] font-semibold" style={{ color: remaining === 0 ? "#EF4444" : "#A855F7" }}>
              {generationsToday} / {limit}
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "#2A2A3E" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(100, (generationsToday / limit) * 100)}%`,
                background: remaining === 0
                  ? "linear-gradient(90deg, #EF4444, #F59E0B)"
                  : "linear-gradient(90deg, #A855F7, #06B6D4)",
              }}
            />
          </div>
          {remaining > 0 && (
            <p className="mt-2 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
              Сбрасывается в полночь UTC
            </p>
          )}
        </div>

        {/* Преимущества */}
        <div className="grid grid-cols-2 gap-2.5">
          {PERKS.map(({ Icon, color, glow, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl p-3.5 flex flex-col gap-2"
              style={{
                background: glow,
                border: `1px solid ${color}25`,
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}
              >
                <Icon size={14} style={{ color }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-white leading-snug">{title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA кнопки */}
        <Link
          href="/pricing"
          onClick={onClose}
          className="flex items-center justify-center gap-2.5 w-full rounded-2xl py-3.5 text-[14px] font-bold transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #A855F7, #7C3AED)",
            color: "#fff",
            boxShadow: "0 0 30px rgba(168,85,247,0.3), 0 8px 24px rgba(0,0,0,0.4)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
        >
          Улучшить тариф <ArrowRight size={15} />
        </Link>

        <Link
          href="/pricing#trial"
          onClick={onClose}
          className="flex items-center justify-center w-full rounded-2xl py-2.5 text-[13px] font-medium transition-colors"
          style={{
            background: "rgba(245,158,11,0.07)",
            border: "1px solid rgba(245,158,11,0.2)",
            color: "#F59E0B",
          }}
        >
          🎁 Попробовать 7 дней бесплатно
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-2xl py-2.5 text-[12px] transition-colors"
          style={{ color: "rgba(255,255,255,0.25)" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.25)" }}
        >
          Продолжить с текущим тарифом
        </button>
      </div>
    </PremiumModal>
  )
}

/* ================================================================
   useUpgradeNudge — хук для отслеживания генераций и показа нуджа
   ----------------------------------------------------------------
   Подгружает текущие AI-лимиты при монтировании.
   Вызывай trackGeneration() после каждой успешной генерации.
   Хук автоматически откроет модалку когда счётчик >= THRESHOLD.

   Пример:
     const { nudgeOpen, closeNudge, trackGeneration, usageData } = useUpgradeNudge()
     // после успешного generateProject():
     await trackGeneration()
   ================================================================ */
interface UsageData {
  plan: string
  mode: "generations" | "orchestrator"
  generations?: { used: number; limit: number | null }
}

export function useUpgradeNudge() {
  const { user } = useAuth()
  const [nudgeOpen, setNudgeOpen] = useState(false)
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  /* Предотвращаем повторный показ в одну сессию */
  const shownRef = useRef(false)

  /* Загружаем текущее использование при монтировании */
  useEffect(() => {
    if (!user) return
    apiClient
      .get<UsageData>("/subscription/ai-usage", { skipAuthRedirect: true } as any)
      .then(setUsageData)
      .catch(() => {})
  }, [user])

  /**
   * Вызывается после каждой успешной AI-генерации.
   * Обновляет счётчик и показывает нудж при достижении порога.
   */
  async function trackGeneration() {
    if (!user) return

    try {
      const fresh = await apiClient.get<UsageData>("/subscription/ai-usage", { skipAuthRedirect: true } as any)
      setUsageData(fresh)

      /* Показываем нудж только free-пользователям, только 1 раз за сессию,
         и только когда используется >= THRESHOLD генераций */
      if (
        !shownRef.current &&
        fresh.plan === "free" &&
        fresh.mode === "generations" &&
        fresh.generations &&
        fresh.generations.used >= UPGRADE_NUDGE_THRESHOLD &&
        fresh.generations.limit !== null
      ) {
        shownRef.current = true
        setNudgeOpen(true)
      }
    } catch {
      /* тихо игнорируем — нудж необязательная фича */
    }
  }

  return {
    nudgeOpen,
    closeNudge: () => setNudgeOpen(false),
    trackGeneration,
    usageData,
  }
}
