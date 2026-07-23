"use client"

/* ================================================================
   DemoProjectModal — модалка создания демо-проекта на лендинге
   ----------------------------------------------------------------
   Использует PremiumModal как обёртку.
   Поле имени + выбор темы + кнопка генерации + счётчик генераций.
   После генерации показывает результат (проект + карточки артефактов).
   Хранит состояние в localStorage (ключ "osgard_demo_v2").
   ================================================================ */

import { useState, useEffect, useCallback } from "react"
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
  Zap,
  Shield,
  Gem,
  Swords,
  ArrowRight,
  RefreshCw,
} from "lucide-react"
import { PremiumModal } from "./PremiumModal"

/* ---- типы ---- */
interface DemoArtifact {
  id: string
  name: string
  type: string
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  price: number
}

interface DemoProject {
  name: string
  description: string
  badge: string
  artifactCount: number
  artifacts: DemoArtifact[]
  generatedAt: number
}

interface DemoSessionV2 {
  projects: DemoProject[]
  generationsUsed: number
  expiresAt: number
}

const STORAGE_KEY = "osgard_demo_v2"
const MAX_GENERATIONS = 3

/* ---- темы ---- */
const THEMES = [
  { id: "scifi",    label: "Sci-Fi",         hint: "научная фантастика, космос, технологии",  Icon: Rocket },
  { id: "fantasy",  label: "Fantasy",         hint: "фэнтези, магия, мифические существа",     Icon: Wand2 },
  { id: "cyberpunk",label: "Cyberpunk",       hint: "киберпанк, неон, мегаполисы, хакеры",     Icon: Cpu },
  { id: "steampunk",label: "Steampunk",       hint: "стимпанк, пар, викторианская эпоха",      Icon: Cog },
  { id: "postapoc", label: "Post-Apocalypse", hint: "постапокалипсис, выживание, руины",        Icon: Skull },
  { id: "mythology",label: "Mythology",       hint: "мифология, боги, герои, легенды",          Icon: Crown },
]

/* ---- редкости ---- */
const RARITY_META: Record<DemoArtifact["rarity"], { label: string; color: string }> = {
  common:    { label: "Обычный",    color: "#9CA3AF" },
  uncommon:  { label: "Необычный",  color: "#34D399" },
  rare:      { label: "Редкий",     color: "#60A5FA" },
  epic:      { label: "Эпический",  color: "#A78BFA" },
  legendary: { label: "Легендарный",color: "#FBBF24" },
}

const TYPE_ICON: Record<string, typeof Sparkles> = {
  neural: Cpu, crystal: Gem, weapon: Swords, shield: Shield, artifact: Sparkles,
}

function loadSession(): DemoSessionV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as DemoSessionV2
      if (d.expiresAt > Date.now()) return d
    }
  } catch { /* ignore */ }
  return { projects: [], generationsUsed: 0, expiresAt: Date.now() + 86400_000 }
}

function saveSession(s: DemoSessionV2) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

/* ================================================================ */
export interface DemoProjectModalProps {
  open: boolean
  onClose: () => void
  /** Колбэк когда достигнут лимит генераций — показать IkeaModal */
  onLimitReached: (session: DemoSessionV2) => void
}

export function DemoProjectModal({ open, onClose, onLimitReached }: DemoProjectModalProps) {
  const [name, setName] = useState("")
  const [theme, setTheme] = useState(THEMES[0])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<DemoSessionV2>(() => ({ projects: [], generationsUsed: 0, expiresAt: 0 }))
  const [lastResult, setLastResult] = useState<DemoProject | null>(null)

  /* Загружаем сессию при открытии */
  useEffect(() => {
    if (open) Promise.resolve().then(() => setSession(loadSession()))
  }, [open])

  const remaining = MAX_GENERATIONS - session.generationsUsed

  const handleGenerate = useCallback(async () => {
    if (!name.trim()) { setError("Введи название своей вселенной"); return }
    if (remaining <= 0) { onLimitReached(session); return }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/demo/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), hint: theme.hint }),
      })

      if (!res.ok) {
        if (res.status === 429) { onLimitReached(session); return }
        const j = await res.json().catch(() => ({}))
        setError(j.error || "Ошибка генерации. Попробуй ещё раз.")
        return
      }

      const data = await res.json()
      const newProject: DemoProject = {
        name: data.project.name,
        description: data.project.description,
        badge: data.project.badge,
        artifactCount: data.artifacts.length,
        artifacts: data.artifacts,
        generatedAt: Date.now(),
      }

      const updated: DemoSessionV2 = {
        projects: [newProject, ...session.projects],
        generationsUsed: session.generationsUsed + 1,
        expiresAt: session.expiresAt > Date.now() ? session.expiresAt : Date.now() + 86400_000,
      }
      saveSession(updated)
      setSession(updated)
      setLastResult(newProject)

      if (updated.generationsUsed >= MAX_GENERATIONS) {
        setTimeout(() => onLimitReached(updated), 1800)
      }
    } catch {
      setError("Сервер недоступен. Попробуй позже.")
    } finally {
      setLoading(false)
    }
  }, [name, theme, remaining, session, onLimitReached])

  const handleReset = () => {
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
    setSession({ projects: [], generationsUsed: 0, expiresAt: Date.now() + 86400_000 })
    setLastResult(null)
    setName("")
    setError(null)
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
            onChange={(e) => { setName(e.target.value); setError(null) }}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleGenerate()}
            placeholder="Например: Мой AI-арсенал"
            disabled={loading}
            className="w-full rounded-2xl px-4 py-3.5 text-[15px] text-white placeholder-white/25 outline-none transition-all duration-200"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: error ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.1)",
            }}
            onFocus={(e) => { e.currentTarget.style.border = "1px solid rgba(6,182,212,0.4)" }}
            onBlur={(e) => { e.currentTarget.style.border = error ? "1px solid rgba(239,68,68,0.5)" : "1px solid rgba(255,255,255,0.1)" }}
          />
          {error && <p className="mt-2 text-[12px]" style={{ color: "#F87171" }}>{error}</p>}
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

        {/* Результат последней генерации */}
        {lastResult && !loading && (
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.07)",
              animation: "pm-scale-in 0.35s cubic-bezier(0.16,1,0.3,1) both",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[16px] font-semibold text-white">{lastResult.name}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {lastResult.description}
                </p>
              </div>
              <span
                className="shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: "rgba(6,182,212,0.1)", color: "#06B6D4", border: "1px solid rgba(6,182,212,0.2)" }}
              >
                {lastResult.artifactCount} арт.
              </span>
            </div>

            {/* Карточки артефактов */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lastResult.artifacts.slice(0, 6).map((a) => {
                const ArtIcon = TYPE_ICON[a.type] || Sparkles
                const rm = RARITY_META[a.rarity] || RARITY_META.common
                return (
                  <div
                    key={a.id}
                    className="rounded-xl p-3 flex flex-col gap-1.5"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: `1px solid ${rm.color}22`,
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <ArtIcon size={13} strokeWidth={1.75} style={{ color: rm.color }} />
                      <span className="text-[11px] font-medium truncate text-white/80">{a.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px]" style={{ color: rm.color }}>{rm.label}</span>
                      <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>⚡{a.power}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Сохранить */}
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
