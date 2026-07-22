"use client"

import { useTranslation } from "@/lib/i18n/use-translation"
import { COLORS } from "@/lib/economy"

/** Заголовок раздела оркестратора — анимированный градиентный текст поверх glow/scanline-фона. */
export function OrchestratorHero() {
  const { t } = useTranslation()

  return (
    <div className="orch-hero relative mb-2 overflow-hidden rounded-2xl px-6 py-8" style={{ border: `1px solid ${COLORS.border}` }}>
      <style>{ORCHESTRATOR_HERO_CSS}</style>
      <div className="orch-hero-glow" aria-hidden="true" />
      <div className="orch-hero-scanline" aria-hidden="true" />
      <div className="relative">
        <h1 className="orch-hero-title text-4xl font-extrabold tracking-tight md:text-5xl">
          {t("orchestrator.heroTitle")}
        </h1>
        <p className="orch-hero-subtitle mt-2 text-[14px]" style={{ color: COLORS.label }}>
          {t("orchestrator.heroSubtitle")}
        </p>
      </div>
    </div>
  )
}

const ORCHESTRATOR_HERO_CSS = `
.orch-hero {
  background: radial-gradient(120% 140% at 15% 0%, rgba(0,212,255,0.10) 0%, rgba(10,10,15,0) 55%), #0E0E16;
  animation: orch-hero-in 0.6s ease-out both;
}
.orch-hero-glow {
  position: absolute;
  inset: -40% -10% auto -10%;
  height: 220px;
  background: radial-gradient(50% 100% at 50% 0%, rgba(0,212,255,0.22) 0%, rgba(74,222,128,0.12) 45%, transparent 75%);
  filter: blur(28px);
  pointer-events: none;
}
.orch-hero-scanline {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(180deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 3px);
  mix-blend-mode: overlay;
  pointer-events: none;
}
.orch-hero-title {
  background: linear-gradient(100deg, #00D4FF 0%, #7DF9C8 35%, #4ADE80 55%, #00D4FF 80%);
  background-size: 220% auto;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: orch-hero-shine 5s linear infinite;
}
.orch-hero-subtitle {
  animation: orch-hero-in 0.6s ease-out 0.1s both;
}
@keyframes orch-hero-shine {
  to { background-position: -220% center; }
}
@keyframes orch-hero-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
`
