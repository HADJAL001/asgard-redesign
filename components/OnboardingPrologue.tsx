"use client"

/* ================================================================
   OSGARD · OnboardingPrologue
   ----------------------------------------------------------------
   Обязательный полноэкранный экран, который показывается сразу
   после успешной регистрации, до перехода на /dashboard (или сразу
   на дашборде, если тур ещё не открыт). Задаёт тон миру OSGARD перед
   тем, как пользователь увидит первый шаг OnboardingTutorial.
   ================================================================ */

import { useTranslation } from "@/lib/i18n/use-translation"

const ACCENT = "#00D4FF"
const CARD = "#14141E"
const BORDER = "#2A2A3E"

interface OnboardingPrologueProps {
  /** Отображаемое имя пользователя, подставляется в приветствие. */
  name: string
  /** Вызывается по клику на «Войти в мир →». */
  onContinue: () => void
}

export function OnboardingPrologue({ name, onContinue }: OnboardingPrologueProps) {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-6"
      style={{
        background: "linear-gradient(180deg, #0A0A0F 0%, #0F0F1A 100%)",
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-8 text-center"
        style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}
      >
        <span
          className="mb-6 inline-block text-[16px] font-semibold tracking-[0.18em]"
          style={{
            background: "linear-gradient(135deg, #C9A84C 0%, #E5D4A0 50%, #C9A84C 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          OSGARD
        </span>
        <p
          className="mb-8 text-[17px] leading-relaxed"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          {t("onboarding.prologue.greeting", { name })}
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="rounded-lg px-8 py-3 text-[14px] font-medium transition-transform hover:-translate-y-px"
          style={{ backgroundColor: ACCENT, color: "#0A0A0F" }}
        >
          {t("onboarding.prologue.cta")}
        </button>
      </div>
    </div>
  )
}

export default OnboardingPrologue
