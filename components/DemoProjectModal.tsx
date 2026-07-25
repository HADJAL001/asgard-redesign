"use client"

/* ================================================================
   DemoProjectModal — модалка создания демо-проекта на лендинге
   ----------------------------------------------------------------
   Использует PremiumModal как обёртку.
   Поле имени + выбор темы + кнопка генерации + счётчик генераций.
   После генерации показывает результат (проект + карточки артефактов).
   Хранит состояние в localStorage (ключ "osgard_demo_v2").
   ================================================================ */

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Sparkles,
  Loader2,
  Rocket,
  Wand2,
  Cpu,
  Skull,
  Cog,
  Crown,
  ArrowRight,
  RefreshCw,
} from "lucide-react"
import { PremiumModal } from "./PremiumModal"
import { ProjectArtifactReveal, type RevealRarityMeta } from "./ProjectArtifactReveal"
import { useDemoGenerate } from "@/hooks/useDemoGenerate"
import {
  loadSession,
  STORAGE_KEY,
  MAX_GENERATIONS,
  type DemoArtifact,
  type DemoProject,
  type DemoSessionV2,
} from "@/lib/demo-client"

/* ---- темы ---- */
const THEMES = [
  { id: "scifi",    label: "Sci-Fi",         hint: "научная фантастика, космос, технологии",  Icon: Rocket },
  { id: "fantasy",  label: "Fantasy",         hint: "фэнтези, магия, мифические существа",     Icon: Wand2 },
  { id: "cyberpunk",label: "Cyberpunk",       hint: "киберпанк, неон, мегаполисы, хакеры",     Icon: Cpu },
  { id: "steampunk",label: "Steampunk",       hint: "стимпанк, пар, викторианская эпоха",      Icon: Cog },
  { id: "postapoc", label: "Post-Apocalypse", hint: "постапокалипсис, выживание, руины",        Icon: Skull },
  { id: "mythology",label: "Mythology",       hint: "мифология, боги, герои, легенды",          Icon: Crown },
]

/* ---- редкости (demo-таксономия → словарь reveal-компонента) ----
   Символы усиливают «ощутимость» тира; legendary — высший тир demo:
   голографическая фольга (glow), epic — золотое сияние (shine). */
const REVEAL_RARITY_META: Record<DemoArtifact["rarity"], RevealRarityMeta> = {
  common:    { label: "Обычный",     color: "#9CA3AF", symbol: "○" },
  uncommon:  { label: "Необычный",   color: "#34D399", symbol: "◇" },
  rare:      { label: "Редкий",      color: "#60A5FA", symbol: "◆" },
  epic:      { label: "Эпический",   color: "#A78BFA", symbol: "★", shine: true },
  legendary: { label: "Легендарный", color: "#FBBF24", symbol: "∞", glow: true },
}

/* ================================================================ */
export interface DemoProjectModalProps {
  open: boolean
  onClose: () => void
  /** Колбэк когда достигнут лимит генераций — показать IkeaModal */
  onLimitReached: (session: DemoSessionV2) => void
  /** Предзаполненное имя вселенной (пробрасывается из hero-формы лендинга). */
  initialName?: string
}

export function DemoProjectModal({ open, onClose, onLimitReached, initialName }: DemoProjectModalProps) {
  const [name, setName] = useState("")
  const [theme, setTheme] = useState(THEMES[0])
  const [formError, setFormError] = useState<string | null>(null)

  const { session, remaining, loading, error, lastResult, generate, reset } = useDemoGenerate({ onLimitReached })

  /* При открытии: сбрасываем ошибку валидации и подхватываем имя из hero-формы. */
  useEffect(() => {
    if (open) Promise.resolve().then(() => {
      setFormError(null)
      if (initialName) setName(initialName)
    })
  }, [open, initialName])

  const displayError = formError || error

  const handleGenerate = () => {
    if (!name.trim()) { setFormError("Введи название своей вселенной"); return }
    setFormError(null)
    generate(name.trim(), theme.hint)
  }

  const handleReset = () => {
    reset()
    setName("")
    setFormError(null)
  }

  return (
    <PremiumModal
      open={open}
      onClose={onClose}
      maxWidth="xl"
      title="Создай свою вселенную"
      subtitle="AI генерирует уникальный проект с артефактами за секунды — бесплатно"
      icon={<Sparkles size={22} style={{ color: "#06B6D4" }} />}
    >
      <div className="space-y-5">

        {/* Счётчик генераций */}
        <div
          className="flex items-center justify-between rounded-2xl px-4 py-3"
          style={{ background: "rgba(6,182,212,0.06)", border: "1px solid rgba(6,182,212,0.15)" }}
        >
          <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>
            ⚡ Бесплатных генераций
          </span>
          <div className="flex items-center gap-2">
            {Array.from({ length: MAX_GENERATIONS }).map((_, i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full transition-all duration-300"
                style={{
                  background: i < remaining
                    ? "linear-gradient(135deg, #06B6D4, #A855F7)"
                    : "rgba(255,255,255,0.1)",
                  boxShadow: i < remaining ? "0 0 8px rgba(6,182,212,0.6)" : "none",
                }}
              />
            ))}
            <span className="text-[13px] font-semibold ml-1" style={{ color: remaining > 0 ? "#06B6D4" : "#EF4444" }}>
              {remaining} / {MAX_GENERATIONS}
            </span>
          </div>
        </div>

        {/* Поле имени */}
        <div>
          <label className="block text-[12px] font-medium mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            КАК НАЗЫВАЕТСЯ ТВОЯ ВСЕЛЕННАЯ?
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setFormError(null) }}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
            placeholder="Например: Мой AI-арсенал"
            disabled={loading}
            className="w-full rounded-2xl px-4 py-3.5 text-[15px] text-white placeholder-white/25 outline-none transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: displayError ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.1)",
            }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(6,182,212,0.4)" }}
            onBlur={(e) => { e.currentTarget.style.border = displayError ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.1)" }}
          />
          {displayError && <p className="mt-2 text-[12px]" style={{ color: "#F87171" }}>{displayError}</p>}
        </div>

        {/* Выбор темы */}
        <div>
          <label className="block text-[12px] font-medium mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>
            ВЫБЕРИ ТЕМУ
          </label>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const Icon = t.Icon
              const active = theme.id === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t)}
                  disabled={loading}
                  className="flex flex-col items-center gap-2 rounded-2xl px-3 py-3.5 text-[12px] font-medium transition-all duration-200 disabled:opacity-50"
                  style={{
                    background: active
                      ? "linear-gradient(135deg, rgba(6,182,212,0.15), rgba(168,85,247,0.15))"
                      : "rgba(255,255,255,0.03)",
                    border: active
                      ? "1px solid rgba(6,182,212,0.35)"
                      : "1px solid rgba(255,255,255,0.07)",
                    color: active ? "#fff" : "rgba(255,255,255,0.45)",
                    boxShadow: active ? "0 0 16px rgba(6,182,212,0.1)" : "none",
                  }}
                >
                  <Icon
                    size={18}
                    strokeWidth={1.5}
                    style={{ color: active ? "#06B6D4" : "rgba(255,255,255,0.35)" }}
                  />
                  {t.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Кнопка генерации */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={loading || !name.trim() || remaining <= 0}
          className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 text-[15px] font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: "linear-gradient(135deg, #06B6D4, #7C3AED)",
            color: "#fff",
            boxShadow: loading || !name.trim() ? "none" : "0 0 30px rgba(6,182,212,0.3), 0 8px 24px rgba(0,0,0,0.4)",
          }}
          onMouseEnter={(e) => { if (!loading && name.trim()) e.currentTarget.style.transform = "translateY(-1px)" }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
        >
          {loading ? (
            <><Loader2 size={18} className="animate-spin" /> Генерируем вселенную…</>
          ) : (
            <><Sparkles size={18} /> Сгенерировать AI</>
          )}
        </button>

        {/* Результат последней генерации — experiential-reveal «рождения»
            артефактов из проекта, тот же компонент, что в авторизованном flow. */}
        {lastResult && !loading && (
          <div style={{ animation: "pm-scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both" }}>
            <ProjectArtifactReveal
              projectName={lastResult.name}
              projectDescription={lastResult.description}
              projectBadge={`${lastResult.artifactCount} артефактов рождено вместе с проектом`}
              artifacts={lastResult.artifacts}
              rarityMeta={REVEAL_RARITY_META}
              ctaSlot={
                <Link
                  href="/register"
                  className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-[13px] font-semibold transition-all duration-200"
                  style={{
                    background: "linear-gradient(135deg, #F59E0B, #EF4444)",
                    color: "#fff",
                    boxShadow: "0 0 20px rgba(245,158,11,0.2)",
                  }}
                >
                  💾 Сохранить вселенную <ArrowRight size={14} />
                </Link>
              }
            />
          </div>
        )}

        {/* Предыдущие генерации */}
        {session.projects.length > 1 && (
          <div className="pt-1">
            <p className="text-[11px] mb-2" style={{ color: "rgba(255,255,255,0.25)" }}>
              ПРЕДЫДУЩИЕ ВСЕЛЕННЫЕ
            </p>
            <div className="space-y-1.5">
              {session.projects.slice(1).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-3 py-2"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span className="text-[13px] text-white/60">{p.name}</span>
                  <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>{p.artifactCount} арт.</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Кнопка сброса */}
        {session.generationsUsed > 0 && (
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-[11px] mx-auto transition-colors duration-200"
            style={{ color: "rgba(255,255,255,0.2)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.45)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.2)" }}
          >
            <RefreshCw size={11} /> Начать заново
          </button>
        )}
      </div>
    </PremiumModal>
  )
}

/* Экспортируем утилиту для загрузки сессии извне (для IkeaModal) */
export { loadSession, type DemoSessionV2, type DemoProject, STORAGE_KEY, MAX_GENERATIONS }
