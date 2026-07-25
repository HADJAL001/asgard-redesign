"use client"

/* ================================================================
   ProjectArtifactReveal — experiential-анимация «рождения» артефактов
   ----------------------------------------------------------------
   Показывает связь «проект → артефакты» в момент, когда она наименее
   очевидна: сразу после успешной AI-генерации. Используется в обоих
   flow — гостевом (DemoProjectModal) и авторизованном
   (project-create-wizard, ветка mode === "ai") — как единственная
   точка триггера в каждом из них.

   Таксономии редкости у demo и реальной экономики расходятся, поэтому
   компонент принимает rarityMeta как проп, а не импортирует RARITY
   из lib/economy напрямую.
   ================================================================ */

import { useEffect, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Sparkles, Cpu, Gem, Swords, Shield } from "lucide-react"

export interface RevealArtifact {
  id: string | number
  name: string
  type: string
  rarity: string
  power: number
  defense: number
  magic: number
  speed: number
}

export interface RevealRarityMeta {
  label: string
  color: string
}

export interface ProjectArtifactRevealProps {
  projectName: string
  projectDescription?: string
  projectBadge?: string
  artifacts: RevealArtifact[]
  rarityMeta: Record<string, RevealRarityMeta>
  /** Вызывается, когда пользователь готов продолжить (нет ctaSlot — рендерится кнопка по умолчанию). */
  onDone?: () => void
  /** Кастомное действие вместо кнопки «Продолжить» (например, ссылка на регистрацию). */
  ctaSlot?: ReactNode
}

const TYPE_ICON: Record<string, typeof Sparkles> = {
  neural: Cpu,
  crystal: Gem,
  weapon: Swords,
  shield: Shield,
  artifact: Sparkles,
}

function pluralizeArtifacts(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "артефакт"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "артефакта"
  return "артефактов"
}

export function ProjectArtifactReveal({
  projectName,
  projectDescription,
  projectBadge,
  artifacts,
  rarityMeta,
  onDone,
  ctaSlot,
}: ProjectArtifactRevealProps) {
  const reduce = useReducedMotion()
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    // При reduced-motion артефакты видны сразу (см. artifactsVisible ниже) — таймер
    // не нужен и синхронный setState в эффекте не вызывается (react-hooks/set-state-in-effect).
    if (reduce) return
    const timer = setTimeout(() => setRevealed(true), 850)
    return () => clearTimeout(timer)
  }, [reduce])

  const showArtifacts = revealed || !!reduce

  const fallbackMeta: RevealRarityMeta = Object.values(rarityMeta)[0] ?? { label: "", color: "#9CA3AF" }

  return (
    <div className="flex flex-col items-center gap-5 text-center">
      {/* Проект — источник */}
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center gap-1.5 rounded-2xl px-6 py-4"
        style={{
          background: "linear-gradient(135deg, rgba(6,182,212,0.1), rgba(168,85,247,0.1))",
          border: "1px solid rgba(6,182,212,0.25)",
        }}
      >
        <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
          Проект создан
        </span>
        <span className="text-[16px] font-semibold text-white">{projectName}</span>
        {projectDescription && (
          <span className="text-[12px] max-w-[280px] leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            {projectDescription}
          </span>
        )}
        {projectBadge && (
          <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>{projectBadge}</span>
        )}
      </motion.div>

      {/* Связующая подпись */}
      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: showArtifacts ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="text-[12px]"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        ↓ вместе с ним родил{artifacts.length === 1 ? "ся" : "ись"} {artifacts.length} {pluralizeArtifacts(artifacts.length)}
      </motion.p>

      {/* Артефакты — «вылетают» из проекта */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full">
        {artifacts.map((a, i) => {
          const Icon = TYPE_ICON[a.type] || Sparkles
          const meta = rarityMeta[a.rarity] || fallbackMeta
          return (
            <motion.div
              key={a.id}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.9 }}
              animate={showArtifacts ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 16, scale: 0.9 }}
              transition={{ duration: 0.4, delay: reduce ? 0 : i * 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-1.5 rounded-xl p-3"
              style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${meta.color}33` }}
            >
              <Icon size={18} strokeWidth={1.5} style={{ color: meta.color }} />
              <span className="text-[11px] font-medium text-white/85 truncate w-full text-center">{a.name}</span>
              <span className="text-[10px]" style={{ color: meta.color }}>{meta.label}</span>
            </motion.div>
          )
        })}
      </div>

      {(ctaSlot || onDone) && (
        <motion.div
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: showArtifacts ? 1 : 0 }}
          transition={{ duration: 0.3, delay: reduce ? 0 : 0.2 }}
          className="w-full"
        >
          {ctaSlot ?? (
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-2xl py-3 text-[13px] font-semibold transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(135deg, #06B6D4, #7C3AED)", color: "#fff" }}
            >
              Продолжить
            </button>
          )}
        </motion.div>
      )}
    </div>
  )
}
