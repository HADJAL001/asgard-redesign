"use client"

/* ================================================================
   OSGARD · OnboardingTutorial
   ----------------------------------------------------------------
   Модальный тьюториал онбординга для новых пользователей — тур по
   8 ключевым фичам платформы. Каждый шаг начисляет награду через
   бэкенд:

     1: Знакомство        — 15 credits
     2: Мастер кузницы     — 20 credits
     3: Экономика          — 15 credits
     4: Исследователь      — 20 credits
     5: Голос              — 18 credits
     6: Личность           — 18 credits
     7: Властелин (админ)  — 15 credits
     8: Первопроходец      — бейдж 'pervoprohodets' + 25 crystals (финал)

   После шага 8 показывается полноэкранная сцена «Посвящение» с
   анимированным бейджем и следующей целью игрока.

   Взаимодействует с бэкендом:
     GET  /onboarding/status → { currentStep, completed }
     POST /onboarding/step   → { step } → начисляет награду, возвращает
                                 { success, currentStep, completed, reward }

   После получения награды локально обновляет кошелёк через
   useOsgardStore().fetchWallet(), чтобы остальной UI (навбар, дашборд)
   сразу отобразил актуальный баланс.
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Home,
  Hammer,
  Wallet,
  Compass,
  MessageCircle,
  User,
  Crown,
  PartyPopper,
  Coins,
  Gem,
  Award,
  X,
  Loader2,
} from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { useAuth } from "@/lib/auth-store"
import { useTranslation } from "@/lib/i18n/use-translation"

const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"
const LABEL = "#6A6A8A"

const ONBOARDING_CSS = `
@keyframes osgard-badge-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(181,123,255,0.55); transform: scale(1); }
  50% { box-shadow: 0 0 0 10px rgba(181,123,255,0); transform: scale(1.06); }
}
@keyframes osgard-badge-pop {
  0% { transform: scale(0.4) rotate(-8deg); opacity: 0; }
  60% { transform: scale(1.1) rotate(4deg); opacity: 1; }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
.osgard-badge-icon { animation: osgard-badge-pulse 2.2s ease-in-out infinite; border-radius: 9999px; }
.osgard-final-icon {
  animation: osgard-badge-pop 0.6s cubic-bezier(0.34,1.56,0.64,1) both,
             osgard-badge-pulse 2.4s ease-in-out 0.6s infinite;
}
`

type StepReward = {
  credits?: number
  crystals?: number
  badge?: string
}

type OnboardingStep = {
  step: number
  /** Ключ шага в lib/i18n/locales/*.json → onboarding.steps.<i18nKey> */
  i18nKey: string
  hasAdminDescription?: boolean
  reward: StepReward
  Icon: typeof Home
}

const STEPS: OnboardingStep[] = [
  { step: 1, i18nKey: "step1", reward: { credits: 15 }, Icon: Home },
  { step: 2, i18nKey: "step2", reward: { credits: 20 }, Icon: Hammer },
  { step: 3, i18nKey: "step3", reward: { credits: 15 }, Icon: Wallet },
  { step: 4, i18nKey: "step4", reward: { credits: 20 }, Icon: Compass },
  { step: 5, i18nKey: "step5", reward: { credits: 18 }, Icon: MessageCircle },
  { step: 6, i18nKey: "step6", reward: { credits: 18 }, Icon: User },
  { step: 7, i18nKey: "step7", reward: { credits: 15 }, Icon: Crown, hasAdminDescription: true },
  { step: 8, i18nKey: "step8", reward: { badge: "pervoprohodets", crystals: 25 }, Icon: PartyPopper },
]

function RewardBadge({
  reward,
  t,
}: {
  reward: StepReward
  t: (key: string, vars?: Record<string, string | number>) => string
}) {
  const parts: React.ReactNode[] = []
  if (reward.credits) {
    parts.push(
      <span key="credits" className="inline-flex items-center gap-1">
        <Coins size={14} style={{ color: "#FFD54A" }} />
        {t("onboarding.creditsUnit", { count: reward.credits })}
      </span>,
    )
  }
  if (reward.crystals) {
    parts.push(
      <span key="crystals" className="inline-flex items-center gap-1">
        <Gem size={14} style={{ color: ACCENT }} />
        {t(reward.crystals === 1 ? "onboarding.crystalUnit" : "onboarding.crystalsUnit", { count: reward.crystals })}
      </span>,
    )
  }
  if (reward.badge) {
    parts.push(
      <span key="badge" className="inline-flex items-center gap-1">
        <span className="osgard-badge-icon inline-flex">
          <Award size={14} style={{ color: "#B57BFF" }} />
        </span>
        {reward.badge === "pervoprohodets" ? t("onboarding.badgePervoprohodets") : t("onboarding.badgeGeneric", { badge: reward.badge })}
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
  /** Текущий шаг онбординга (0..8), полученный извне (например, из dashboard-view). */
  initialStep?: number
  /** Вызывается, когда онбординг полностью завершён (финальная сцена закрыта) или тур закрыт пользователем. */
  onFinish?: () => void
}

export function OnboardingTutorial({ initialStep = 0, onFinish }: OnboardingTutorialProps) {
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const [justEarned, setJustEarned] = useState<StepReward | null>(null)
  const [showFinal, setShowFinal] = useState(false)

  const fetchWallet = useOsgardStore((s) => s.fetchWallet)
  const { user } = useAuth()
  const { t } = useTranslation()
  const isAdmin = user?.role === "admin"

  /* Подтягиваем актуальный статус онбординга при монтировании */
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await apiClient.get<{ currentStep: number; completed: boolean }>(
          "/onboarding/status",
          { skipAuthRedirect: true },
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

  if (!visible) return null
  if (!showFinal && currentStep >= STEPS.length) return null

  const activeStep = STEPS[Math.min(currentStep, STEPS.length - 1)]
  const progressPct = Math.round((currentStep / STEPS.length) * 100)
  const stepTitle = t(`onboarding.steps.${activeStep.i18nKey}.title`)
  const stepDescription =
    isAdmin && activeStep.hasAdminDescription
      ? t(`onboarding.steps.${activeStep.i18nKey}.adminDescription`)
      : t(`onboarding.steps.${activeStep.i18nKey}.description`)

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
      await fetchWallet({ skipAuthRedirect: true })

      setTimeout(() => {
        setJustEarned(null)
        if (res.completed) {
          setShowFinal(true)
        } else {
          setCurrentStep(res.currentStep)
        }
        setLoading(false)
      }, 900)
    } catch (err: any) {
      setError(err?.message || t("onboarding.stepFailed"))
      setLoading(false)
    }
  }

  function handleClose() {
    setVisible(false)
    onFinish?.()
  }

  function handleFinalContinue() {
    setVisible(false)
    onFinish?.()
  }

  if (showFinal) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center p-6 text-center"
        style={{ backgroundColor: "#0A0A0F" }}
      >
        <style>{ONBOARDING_CSS}</style>
        <span
          className="osgard-final-icon mb-6 flex size-24 items-center justify-center rounded-full"
          style={{ border: `1px solid #B57BFF`, backgroundColor: "#14141E" }}
        >
          <Award size={44} strokeWidth={1.5} style={{ color: "#B57BFF" }} />
        </span>
        <h1
          className="mb-4 text-[28px] font-semibold tracking-wide"
          style={{
            background: "linear-gradient(135deg, #C9A84C 0%, #E5D4A0 50%, #C9A84C 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {t("onboarding.final.title")}
        </h1>
        <p className="mb-6 max-w-md text-[15px] leading-relaxed" style={{ color: "rgba(255,255,255,0.8)" }}>
          {t("onboarding.final.text")}
        </p>
        <div
          className="mb-8 max-w-md rounded-lg px-5 py-3 text-[13px]"
          style={{ backgroundColor: "#14141E", border: `1px solid ${BORDER}`, color: ACCENT }}
        >
          {t("onboarding.final.nextGoal")}
        </div>
        <button
          type="button"
          onClick={handleFinalContinue}
          className="rounded-lg px-8 py-3 text-[14px] font-medium transition-colors"
          style={{ backgroundColor: ACCENT, color: "#0A0A0F" }}
        >
          {t("onboarding.final.continueBtn")}
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(10,10,15,0.72)" }}
    >
      <style>{ONBOARDING_CSS}</style>
      <div
        className="relative w-full max-w-md rounded-2xl p-7"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
      >
        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-md p-1 transition-colors"
          style={{ color: LABEL }}
          aria-label={t("onboarding.closeAria")}
        >
          <X size={18} />
        </button>

        {/* Прогресс */}
        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-[12px]" style={{ color: LABEL }}>
            <span>{t("onboarding.stepOf", { current: currentStep + 1, total: STEPS.length })}</span>
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
          <h2 className="text-[20px] font-semibold text-white">{stepTitle}</h2>
          <p className="mt-2 text-[14px]" style={{ color: "rgba(255,255,255,0.6)" }}>
            {stepDescription}
          </p>
          {activeStep.i18nKey === "step3" && (
            <Link
              href="/docs/economy-map"
              className="mt-3 text-[13px] font-medium transition-opacity hover:opacity-80"
              style={{ color: ACCENT }}
            >
              {t("onboarding.steps.step3.mapLink")}
            </Link>
          )}
        </div>

        {/* Награда за шаг */}
        <div
          className="mb-6 flex items-center justify-center rounded-lg py-3"
          style={{ backgroundColor: "#0A0A0F", border: `1px solid ${BORDER}` }}
        >
          {justEarned ? (
            <span className="text-[13px]" style={{ color: ACCENT }}>
              {t("onboarding.rewardEarned")}
            </span>
          ) : (
            <RewardBadge reward={activeStep.reward} t={t} />
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
              {t("onboarding.loadingBtn")}
            </>
          ) : currentStep === STEPS.length - 1 ? (
            t("onboarding.finishBtn")
          ) : (
            t("onboarding.continueBtn")
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
