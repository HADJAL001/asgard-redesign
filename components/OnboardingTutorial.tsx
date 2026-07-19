"use client"

/* ================================================================
   OSGARD · OnboardingTutorial
   ----------------------------------------------------------------
   Модальный тьюториал онбординга для новых пользователей.
   5 шагов, каждый шаг начисляет награду через бэкенд:

     1: 10 credits
     2: 50 credits
     3: 100 credits + бейдж 'first_lot'
     4: 1 crystal
     5: 5 crystals

   Взаимодействует с бэкендом:
     GET  /onboarding/status → { currentStep, completed }
     POST /onboarding/step   → { step } → начисляет награду, возвращает
                                 { success, currentStep, completed, reward }

   После получения награды локально обновляет кошелёк через
   useOsgardStore().fetchWallet(), чтобы остальной UI (навбар, дашборд)
   сразу отобразил актуальный баланс.
   ================================================================ */

import { useEffect, useState } from "react"
import { Sparkles, Coins, Gem, Award, PartyPopper, X, Loader2 } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useOsgardStore } from "@/lib/store/osgard-store"

const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"

type StepReward = {
  credits?: number
  crystals?: number
  badge?: string
}

type OnboardingStep = {
  step: number
  title: string
  description: string
  reward: StepReward
  Icon: typeof Sparkles
}

const STEPS: OnboardingStep[] = [
  {
    step: 1,
    title: "Добро пожаловать в OSGARD",
    description: "Познакомьтесь с платформой — вашей вселенной проектов и артефактов.",
    reward: { credits: 10 },
    Icon: Sparkles,
  },
  {
    step: 2,
    title: "Создайте первый проект",
    description: "Проекты — основа вашей активности. Загляните в раздел «Проекты».",
    reward: { credits: 50 },
    Icon: Coins,
  },
  {
    step: 3,
    title: "Выставите первый лот",
    description: "Продайте артефакт на маркетплейсе и получите особый бейдж.",
    reward: { credits: 100, badge: "first_lot" },
    Icon: Award,
  },
  {
    step: 4,
    title: "Откройте кошелёк",
    description: "Изучите свои балансы: credits, shards, crystals, timecoin.",
    reward: { crystals: 1 },
    Icon: Gem,
  },
  {
    step: 5,
    title: "Финал! Вы освоились",
    description: "Поздравляем — вы прошли онбординг OSGARD.",
    reward: { crystals: 5 },
    Icon: PartyPopper,
  },
]

function RewardBadge({ reward }: { reward: StepReward }) {
  const parts: React.ReactNode[] = []
  if (reward.credits) {
    parts.push(
      <span key="credits" className="inline-flex items-center gap-1">
        <Coins size={14} style={{ color: "#FFD54A" }} />
        {reward.credits} credits
      </span>,
    )
  }
  if (reward.crystals) {
    parts.push(
      <span key="crystals" className="inline-flex items-center gap-1">
        <Gem size={14} style={{ color: ACCENT }} />
        {reward.crystals} {reward.crystals === 1 ? "crystal" : "crystals"}
      </span>,
    )
  }
  if (reward.badge) {
    parts.push(
      <span key="badge" className="inline-flex items-center gap-1">
        <Award size={14} style={{ color: "#B57BFF" }} />
        Бейдж «{reward.badge}»
      </span>,
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-[13px]" style={{ color: "rgba(255,255,255,0.8)" }}>
      {parts}
    </div>
  )
}

interface OnboardingTutorialProps {
  /** Текущий шаг онбординга (0..5), полученный извне (например, из dashboard-view). */
  initialStep?: number
  /** Вызывается, когда онбординг полностью завершён (шаг 5 пройден) или закрыт пользователем. */
  onFinish?: () => void
}

export function OnboardingTutorial({ initialStep = 0, onFinish }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [justEarned, setJustEarned] = useState<StepReward | null>(null)

  const fetchWallet = useOsgardStore((s) => s.fetchWallet)

  /* Подтягиваем актуальный статус онбординга при монтировании */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiClient.get<{ currentStep: number; completed: boolean }>(
          "/onboarding/status",
        )
        if (!cancelled) {
          setCurrentStep(data.currentStep)
          if (data.completed) setVisible(false)
        }
      } catch {
        /* если статус не удалось получить — работаем с initialStep */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!visible || currentStep >= STEPS.length) return null

  const activeStep = STEPS[currentStep]
  const progressPct = Math.round((currentStep / STEPS.length) * 100)

  async function handleNext() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.post<{
        success: boolean
        currentStep: number
        completed: boolean
        reward: StepReward
      }>("/onboarding/step", { step: activeStep.step })

      setJustEarned(res.reward)

      // Синхронизируем кошелёк с бэкендом, чтобы UI сразу показал новый баланс
      await fetchWallet()

      setTimeout(() => {
        setJustEarned(null)
        if (res.completed) {
          setVisible(false)
          onFinish?.()
        } else {
          setCurrentStep(res.currentStep)
        }
        setLoading(false)
      }, 900)
    } catch (err: any) {
      setError(err?.message || "Не удалось выполнить шаг онбординга")
      setLoading(false)
    }
  }

  function handleClose() {
    setVisible(false)
    onFinish?.()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(10,10,15,0.72)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl p-7"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-md p-1 transition-colors"
          style={{ color: LABEL }}
          aria-label="Закрыть онбординг"
        >
          <X size={18} />
        </button>

        {/* Прогресс */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-[12px]" style={{ color: LABEL }}>
            <span>
              Шаг {currentStep + 1} из {STEPS.length}
            </span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: BORDER }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%`, backgroundColor: ACCENT }}
            />
          </div>
        </div>

        {/* Иконка + заголовок */}
        <div className="mb-5 flex flex-col items-center text-center">
          <span
            className="mb-4 flex size-16 items-center justify-center rounded-2xl"
            style={{ border: `1px solid ${ACCENT}`, backgroundColor: "#0A0A0F" }}
          >
            <activeStep.Icon size={28} strokeWidth={1.5} style={{ color: ACCENT }} />
          </span>
          <h2 className="text-[20px] font-semibold text-white">{activeStep.title}</h2>
          <p className="mt-2 text-[14px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            {activeStep.description}
          </p>
        </div>

        {/* Награда за шаг */}
        <div
          className="mb-6 flex items-center justify-center rounded-lg py-3"
          style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}
        >
          {justEarned ? (
            <span className="text-[13px]" style={{ color: ACCENT }}>
              Награда получена!
            </span>
          ) : (
            <RewardBadge reward={activeStep.reward} />
          )}
        </div>

        {error && (
          <div className="mb-4 text-center text-[13px]" style={{ color: "#FF6B6B" }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleNext}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-colors disabled:opacity-60"
          style={{ backgroundColor: ACCENT, color: "#0A0A0F" }}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Загрузка...
            </>
          ) : currentStep === STEPS.length - 1 ? (
            "Завершить онбординг"
          ) : (
            "Продолжить"
          )}
        </button>

        {/* Точки-индикаторы шагов */}
        <div className="mt-5 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <span
              key={s.step}
              className="size-1.5 rounded-full transition-colors"
              style={{
                backgroundColor: i <= currentStep ? ACCENT : BORDER,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export default OnboardingTutorial
