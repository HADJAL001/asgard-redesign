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

import { useEffect, useRef, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Sparkles, Cpu, Gem, Swords, Shield } from "lucide-react"
import { useSignature, type SignatureCue } from "@/hooks/useSignature"

/* Восемь фиксированных лучей всплеска частиц (детерминированно, без Math.random —
   burst одинаков между рендерами и предсказуем для reduced-motion-гейта). */
const BURST_RAYS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2
  return { x: Math.cos(angle) * 46, y: Math.sin(angle) * 46, delay: (i % 4) * 0.04 }
})

/** Всплеск золотых частиц вокруг «героя» момента (legendary/mythic). */
function ParticleBurst({ color }: { color: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center" aria-hidden>
      {BURST_RAYS.map((r, i) => (
        <motion.span
          key={i}
          className="absolute size-1 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: [0, 1, 0], x: r.x, y: r.y, scale: [0.4, 1, 0.2] }}
          transition={{ duration: 1.1, delay: 0.15 + r.delay, ease: [0.16, 1, 0.3, 1] }}
        />
      ))}
    </div>
  )
}

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
  /** Символ редкости (○ ◇ ◆ ★ ∞) — усиливает «ощутимость» тира. */
  symbol?: string
  /** Высший тир (mythic-подобный): голографическая фольга на имени + сильное свечение. */
  glow?: boolean
  /** Предвысший тир (legendary-подобный): золотое сияние. */
  shine?: boolean
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
  const { play } = useSignature()
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

  // «Лучшая находка» — артефакт с наибольшей суммой статов. Получает подсветку,
  // чтобы в каскаде рождения был явный герой момента.
  const bestId = artifacts.length
    ? artifacts.reduce((best, a) =>
        a.power + a.defense + a.magic + a.speed > best.power + best.defense + best.magic + best.speed ? a : best,
      ).id
    : null

  // Пиковый тир каскада — БЕЗ хардкода таксономии: берём готовые флаги meta
  // (glow ≈ mythic, shine ≈ legendary), которые вызывающий уже проставил.
  const hasGlow = artifacts.some((a) => (rarityMeta[a.rarity] || fallbackMeta).glow)
  const hasShine = artifacts.some((a) => (rarityMeta[a.rarity] || fallbackMeta).shine)
  const peakCue: SignatureCue = hasGlow ? "legendary" : hasShine ? "rarityUp" : "artifactBorn"

  // Сенсорная «подпись» момента — один раз, когда артефакты становятся видны.
  // play() внутри уважает тумблер (по умолчанию OFF) и reduced-motion.
  const signaturePlayed = useRef(false)
  useEffect(() => {
    if (!showArtifacts || signaturePlayed.current || artifacts.length === 0) return
    signaturePlayed.current = true
    play(peakCue)
  }, [showArtifacts, artifacts.length, peakCue, play])

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
          const isBest = a.id === bestId
          // Кульминация только у героя высшего тира (флаги meta, не строки редкости).
          const heroClimax = isBest && !reduce && !!(meta.glow || meta.shine)
          // Свечение иконки пропорционально тиру: высший — двойное, легендарный — золотое.
          const iconGlow = meta.glow
            ? `0 0 18px ${meta.color}, inset 0 0 12px ${meta.color}55`
            : meta.shine
              ? `0 0 14px ${meta.color}88`
              : `0 0 8px ${meta.color}44`
          const statSum = a.power + a.defense + a.magic + a.speed
          return (
            <motion.div
              key={a.id}
              initial={reduce ? false : { opacity: 0, y: 16, scale: 0.9 }}
              animate={
                showArtifacts
                  ? { opacity: 1, y: 0, scale: heroClimax ? [0.9, 1.07, 1] : 1 }
                  : { opacity: 0, y: 16, scale: 0.9 }
              }
              transition={{
                // Герой высшего тира появляется ПОСЛЕ всех, медленнее — климакс каскада.
                duration: heroClimax ? 0.72 : 0.4,
                delay: reduce ? 0 : heroClimax ? artifacts.length * 0.12 + 0.12 : i * 0.12,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="relative flex flex-col items-center gap-1.5 rounded-xl p-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${meta.color}${isBest ? "aa" : "33"}`,
                boxShadow: isBest ? `0 0 20px ${meta.color}33` : "none",
              }}
            >
              {/* Кульминация редкости: вспышка фольги + всплеск частиц вокруг героя. */}
              {heroClimax && (
                <>
                  <ParticleBurst color={meta.color} />
                  <motion.span
                    className="pointer-events-none absolute inset-0 -z-10 rounded-xl"
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 1, 0] }}
                    transition={{ duration: 1, delay: artifacts.length * 0.12 + 0.15, ease: [0.16, 1, 0.3, 1] }}
                    style={{ boxShadow: "var(--eg-glow-gold)", border: `1px solid ${meta.color}` }}
                  />
                </>
              )}
              {isBest && (
                <span
                  className="absolute -top-2 right-2 rounded-full px-1.5 py-px text-[8px] font-semibold uppercase tracking-wide"
                  style={{ background: meta.color, color: "#0A1128" }}
                >
                  ★ находка
                </span>
              )}
              <span
                className="flex size-9 items-center justify-center rounded-lg"
                style={{ border: `1px solid ${meta.color}`, boxShadow: iconGlow }}
              >
                <Icon size={18} strokeWidth={1.5} style={{ color: meta.color }} />
              </span>
              <span
                className={`text-[11px] font-medium truncate w-full text-center ${meta.glow ? "rarity-mythic-foil" : ""}`}
                style={
                  meta.shine
                    ? { color: meta.color, textShadow: `0 0 12px ${meta.color}66` }
                    : { color: "rgba(255,255,255,0.85)" }
                }
              >
                {a.name}
              </span>
              <span className="flex items-center gap-1 text-[10px]" style={{ color: meta.color }}>
                {meta.symbol && <span aria-hidden>{meta.symbol}</span>}
                {meta.label}
              </span>
              <span className="premium-num text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                {statSum} ⚡
              </span>
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
