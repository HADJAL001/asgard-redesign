"use client"

import { useEffect, useRef, useState } from "react"
import { Hammer, Loader2, Sparkles, Coins, Archive, Star, Zap } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore, type OsgardArtifact } from "@/lib/store/osgard-store"
import { COLORS, RARITY, ARTIFACT_TYPES, STAT_META, type ArtifactType, type Rarity } from "@/lib/economy"
import { fmtTC, fmtUSD } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

const TYPE_KEYS = Object.keys(ARTIFACT_TYPES) as ArtifactType[]

/** Фиксированная стоимость создания артефакта (см. backend/artifacts.routes.ts FORGE_COST_TC). */
const FORGE_COST_TC = 50

/** Стоимость AI-генерации артефакта (см. backend/artifacts.routes.ts AI_GENERATE_COST_TC = FORGE_COST_TC). */
const AI_GENERATE_COST_TC = FORGE_COST_TC

/* ---------------- Премиум-усиление (см. backend/artifacts.routes.ts) ----------------
   - Обычное усиление (/evolve): до уровня 5, шанс крита 5%, занимает 24 часа (эмулируется).
   - Премиум усиление (/premium-upgrade): до уровня 10, за TimeCoin, мгновенно.
   - Стоимость шага = текущий_уровень × PREMIUM_UPGRADE_COST_TC_PER_LEVEL.
   - Шанс критического усиления: 25% (+2 уровня вместо +1).
   ------------------------------------------------------------------------------------ */
const PREMIUM_MAX_LEVEL = 10
const PREMIUM_UPGRADE_COST_TC_PER_LEVEL = 20
const PREMIUM_CRIT_CHANCE = 0.25
const NORMAL_CRIT_CHANCE = 0.05

function premiumUpgradeCost(level: number): number {
  return level * PREMIUM_UPGRADE_COST_TC_PER_LEVEL
}

/** Градация визуального "ауры"-эффекта карточки артефакта по уровню (см. обсуждение UX). */
function auraStyleForLevel(level: number, color: string): React.CSSProperties {
  if (level >= 10) {
    return {
      border: `1px solid ${color}`,
      boxShadow: `0 0 0 1px ${color}55, 0 0 18px 2px ${color}66`,
      animation: "osgard-aura-pulse 3.6s ease-in-out infinite",
    }
  }
  if (level >= 8) {
    return {
      border: `1px solid ${color}`,
      boxShadow: `0 0 12px 1px ${color}44`,
    }
  }
  if (level >= 6) {
    return { border: `1px solid ${color}` }
  }
  return { border: `1px solid ${COLORS.border}` }
}


export function ForgeView() {
  const { t } = useTranslation()
  const {
    wallet,
    fetchWallet,
    tcPrice,
    fetchTcState,
    artifacts,
    fetchArtifacts,
    forgeArtifact,
    generateAiArtifact,
    premiumUpgradeArtifact,
    loading,
    error,
  } = useOsgardStore()

  const [name, setName] = useState("")
  const [type, setType] = useState<ArtifactType>("neural")
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [result, setResult] = useState<OsgardArtifact | null>(null)

  /** AI-Генератор артефактов (см. POST /artifacts/generate-ai) — независимое состояние от ручной ковки. */
  const [aiHint, setAiHint] = useState("")
  const [aiSubmitting, setAiSubmitting] = useState(false)
  const [aiNotice, setAiNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [aiResult, setAiResult] = useState<OsgardArtifact | null>(null)

  /** id артефакта, для которого сейчас выполняется премиум-усиление (для disable/spinner на конкретной карточке). */
  const [upgradingId, setUpgradingId] = useState<number | null>(null)
  /** Временный результат усиления для показа бейджа на карточке: { critical, levelGain } на пару секунд. */
  const [upgradeFlash, setUpgradeFlash] = useState<Record<number, { critical: boolean; levelGain: number }>>({})
  const flashTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})

  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false

  async function doPremiumUpgrade(artifactId: number) {
    if (upgradingId !== null) return
    setUpgradingId(artifactId)
    setNotice(null)
    try {
      const res = await premiumUpgradeArtifact(artifactId)
      if (res.success) {
        setUpgradeFlash((prev) => ({
          ...prev,
          [artifactId]: { critical: !!res.critical, levelGain: res.levelGain || 1 },
        }))
        if (flashTimers.current[artifactId]) clearTimeout(flashTimers.current[artifactId])
        flashTimers.current[artifactId] = setTimeout(() => {
          setUpgradeFlash((prev) => {
            const next = { ...prev }
            delete next[artifactId]
            return next
          })
        }, prefersReducedMotion ? 1200 : 1800)
      } else {
        setNotice({ ok: false, text: res.error || t("forge.premiumUpgrade.failed") })
      }
    } finally {
      setUpgradingId(null)
    }
  }

  useEffect(() => {
    return () => {
      Object.values(flashTimers.current).forEach((id) => clearTimeout(id))
    }
  }, [])


  useEffect(() => {
    fetchWallet({ skipAuthRedirect: true })
    fetchTcState({ skipAuthRedirect: true })
    fetchArtifacts({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const TypeIcon = ARTIFACT_TYPES[type].Icon
  const canForge = name.trim().length > 0 && wallet.timecoin >= FORGE_COST_TC

  // Кинематографический эффект при создании
  const [forging, setForging] = useState(false)
  const [forgePhase, setForgePhase] = useState<"idle" | "charging" | "burst" | "reveal">("idle")

  async function doForge() {
    if (!name.trim()) return
    setSubmitting(true)
    setForging(true)
    setForgePhase("charging")
    setNotice(null)
    setResult(null)

    // Фаза 1: заряжаем (~600ms)
    await new Promise((r) => setTimeout(r, 600))
    setForgePhase("burst")

    // Фаза 2: взрыв (~400ms)
    await new Promise((r) => setTimeout(r, 400))

    try {
      const res = await forgeArtifact(name.trim(), type)
      if (res.success && res.artifact) {
        setForgePhase("reveal")
        setResult(res.artifact)
        setNotice({ ok: true, text: `Артефакт «${res.artifact.name}» создан!` })
        setName("")
      } else {
        setForgePhase("idle")
        setForging(false)
        setNotice({ ok: false, text: res.error || "Не удалось создать артефакт" })
      }
    } finally {
      setSubmitting(false)
      setTimeout(() => {
        setForging(false)
        setForgePhase("idle")
      }, 2000)
    }
  }

  async function doGenerateAi() {
    setAiSubmitting(true)
    setAiNotice(null)
    try {
      const res = await generateAiArtifact(aiHint.trim() || undefined)
      if (res.success && res.artifact) {
        setAiResult(res.artifact)
        setAiNotice({ ok: true, text: t("forge.aiGenerate.success", { name: res.artifact.name }) })
        setAiHint("")
      } else {
        setAiNotice({ ok: false, text: res.error || t("forge.aiGenerate.failed") })
      }
    } finally {
      setAiSubmitting(false)
    }
  }

  const canGenerateAi = !aiSubmitting && wallet.timecoin >= AI_GENERATE_COST_TC
  const aiResultRarity: Rarity = (aiResult?.rarity as Rarity) || "common"

  const resultRarity: Rarity = (result?.rarity as Rarity) || "common"
  const ResultTypeIcon = result ? ARTIFACT_TYPES[(result.type as ArtifactType) in ARTIFACT_TYPES ? (result.type as ArtifactType) : "artifact"].Icon : Sparkles

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: COLORS.text }}>
      <Navbar />

      {/* ===== КИНЕМАТОГРАФИЧЕСКИЙ ЭФФЕКТ КУЗНИЦЫ ===== */}
      {forging && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{
            background: forgePhase === "burst"
              ? "radial-gradient(ellipse at center, rgba(0,212,255,0.25) 0%, rgba(0,0,0,0.95) 70%)"
              : "rgba(0,0,0,0.92)",
            backdropFilter: "blur(4px)",
            transition: "background 0.3s ease",
          }}
        >
          <div className="flex flex-col items-center gap-8 text-center">
            {/* Центральная сфера */}
            <div
              className="relative flex items-center justify-center"
              style={{
                width: 200,
                height: 200,
              }}
            >
              {/* Внешние кольца */}
              {[160, 130, 100].map((size, i) => (
                <div
                  key={size}
                  className="absolute rounded-full"
                  style={{
                    width: size,
                    height: size,
                    top: "50%",
                    left: "50%",
                    marginTop: -size / 2,
                    marginLeft: -size / 2,
                    border: `1px solid rgba(0,212,255,${0.15 + i * 0.1})`,
                    animation: `forge-ring-spin ${3 + i * 1.5}s linear infinite ${i % 2 === 0 ? "" : "reverse"}`,
                    opacity: forgePhase === "charging" ? 1 : forgePhase === "burst" ? 0 : 0,
                    transition: "opacity 0.3s ease",
                  }}
                />
              ))}

              {/* Центральный шар */}
              <div
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width: 80,
                  height: 80,
                  background: forgePhase === "burst"
                    ? "radial-gradient(circle at 35% 35%, #fff, #00D4FF 40%, #0050FF)"
                    : "radial-gradient(circle at 35% 35%, rgba(0,212,255,0.6), rgba(0,80,255,0.3))",
                  boxShadow: forgePhase === "burst"
                    ? "0 0 80px 40px rgba(0,212,255,0.8), 0 0 160px 80px rgba(0,212,255,0.4)"
                    : "0 0 30px 10px rgba(0,212,255,0.4)",
                  transition: "all 0.2s ease",
                  animation: forgePhase === "charging" ? "forge-pulse 0.6s ease-in-out infinite" : undefined,
                }}
              >
                {forgePhase === "charging" && (
                  <Zap size={32} style={{ color: "#fff" }} />
                )}
                {forgePhase === "burst" && (
                  <Sparkles size={36} style={{ color: "#fff" }} />
                )}
              </div>

              {/* Частицы при взрыве */}
              {forgePhase === "burst" && Array.from({ length: 12 }).map((_, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    top: "50%",
                    left: "50%",
                    marginTop: -3,
                    marginLeft: -3,
                    background: i % 3 === 0 ? "#00D4FF" : i % 3 === 1 ? "#fff" : "#B57BFF",
                    animation: `forge-particle-burst 0.7s ease-out forwards`,
                    animationDelay: `${i * 0.02}s`,
                    transformOrigin: "center center",
                    "--particle-angle": `${i * 30}deg`,
                  } as React.CSSProperties}
                />
              ))}
            </div>

            {/* Текст фазы */}
            <div>
              <p
                className="text-[22px] font-semibold tracking-widest uppercase"
                style={{
                  color: forgePhase === "burst" ? "#fff" : "#00D4FF",
                  textShadow: forgePhase === "burst" ? "0 0 30px rgba(0,212,255,0.9)" : "none",
                  transition: "all 0.3s ease",
                  letterSpacing: "0.2em",
                }}
              >
                {forgePhase === "charging" ? "ЗАРЯЖАЕМ КУЗНИЦУ" : forgePhase === "burst" ? "✦  АРТЕФАКТ СОЗДАН  ✦" : "ГОТОВО"}
              </p>
              <p className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {forgePhase === "charging" ? "Накапливаем энергию TimeCoin..." : forgePhase === "burst" ? name || "Новый артефакт" : ""}
              </p>
            </div>

            {/* Прогресс-бар */}
            <div className="w-48 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  background: "linear-gradient(90deg, #00D4FF, #B57BFF)",
                  width: forgePhase === "charging" ? "60%" : forgePhase === "burst" ? "100%" : "100%",
                  transition: "width 0.6s ease",
                  boxShadow: "0 0 10px rgba(0,212,255,0.6)",
                }}
              />
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg" style={{ border: `1px solid ${COLORS.border}` }}>
            <Hammer size={18} strokeWidth={1.5} style={{ color: COLORS.accent }} aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("forge.title")}</h1>
            <p className="mt-0.5 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("forge.subtitle")}
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { n: fmtTC(wallet.timecoin), l: t("forge.yourBalance"), Icon: Coins, c: "#F1C40F" },
            { n: fmtTC(FORGE_COST_TC), l: t("forge.creationCost"), Icon: Hammer, c: COLORS.accent },
            { n: fmtUSD(FORGE_COST_TC * tcPrice.price), l: t("forge.inUsd"), Icon: Sparkles, c: COLORS.green },
            { n: `${artifacts.length}`, l: t("forge.artifactsInCollection"), Icon: Archive, c: "#9B59B6" },
          ].map((m) => (
            <div key={m.l} className="rounded-xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
              <m.Icon size={18} strokeWidth={1.5} style={{ color: m.c }} aria-hidden="true" />
              <p className="mt-3 text-[22px] font-medium leading-none">{m.n}</p>
              <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{m.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
          {/* ---- Left: creation form + AI-генератор ---- */}
          <div className="flex flex-col gap-6">
          <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              {t("forge.formTitle")}
            </h2>

            {/* Name */}
            <div className="mt-5">
              <label htmlFor="forge-name" className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>
                {t("forge.artifactName")}
              </label>
              <input
                id="forge-name"
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNotice(null) }}
                placeholder={t("forge.artifactNamePlaceholder")}
                className="cal-input"
              />
            </div>

            {/* Type */}
            <div className="mt-5">
              <p className="mb-2 text-[13px]" style={{ color: COLORS.label }}>{t("forge.artifactType")}</p>
              <div className="flex flex-wrap gap-2">
                {TYPE_KEYS.map((k) => {
                  const active = type === k
                  const Icon = ARTIFACT_TYPES[k].Icon
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setType(k)}
                      aria-pressed={active}
                      className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-[13px] transition-colors"
                      style={{
                        border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                        color: active ? COLORS.accent : "rgba(255,255,255,0.7)",
                        backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                      }}
                    >
                      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                      {ARTIFACT_TYPES[k].label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Rarity info (сервер решает сам) */}
            <div className="mt-5 rounded-lg p-4 text-[13px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <p style={{ color: COLORS.label }}>
                <Sparkles size={13} strokeWidth={1.75} className="mr-1.5 inline-block align-[-2px]" style={{ color: RARITY.common.color }} aria-hidden="true" />
                {t("forge.rarityInfo")}
              </p>
            </div>

            {/* Cost breakdown */}
            <div className="mt-4 space-y-2 rounded-lg p-4 text-[13px]" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${COLORS.border}` }}>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("forge.creationCost")}</span>
                <span>{fmtTC(FORGE_COST_TC)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("forge.yourBalanceLabel")}</span>
                <span style={{ color: wallet.timecoin >= FORGE_COST_TC ? COLORS.green : COLORS.red }}>
                  {fmtTC(wallet.timecoin)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span>{t("forge.remainingAfter")}</span>
                <span className="text-[15px] font-medium" style={{ color: "#FFFFFF" }}>
                  {fmtTC(Math.max(0, wallet.timecoin - FORGE_COST_TC))}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={doForge}
              disabled={!canForge || submitting}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {t("forge.createBtn", { amount: fmtTC(FORGE_COST_TC) })}
            </button>

            {notice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: notice.ok ? COLORS.green : COLORS.red }}>
                {notice.text}
              </p>
            )}
            {error && !notice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: COLORS.red }}>
                {error}
              </p>
            )}
          </section>

          {/* ---- AI-Генератор артефактов (POST /artifacts/generate-ai) ---- */}
          <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <h2 className="flex items-center gap-2 text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              <Sparkles size={16} strokeWidth={1.75} style={{ color: COLORS.accent }} aria-hidden="true" />
              {t("forge.aiGenerate.title")}
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("forge.aiGenerate.subtitle")}
            </p>

            <div className="mt-5">
              <input
                id="ai-generate-hint"
                type="text"
                value={aiHint}
                onChange={(e) => { setAiHint(e.target.value); setAiNotice(null) }}
                placeholder={t("forge.aiGenerate.hintPlaceholder")}
                className="cal-input"
              />
            </div>

            <button
              type="button"
              onClick={doGenerateAi}
              disabled={!canGenerateAi}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "transparent", border: `1px solid ${COLORS.accent}`, color: COLORS.accent }}
            >
              {aiSubmitting && <Loader2 size={16} className="animate-spin" />}
              {t("forge.aiGenerate.button", { amount: fmtTC(AI_GENERATE_COST_TC) })}
            </button>

            {aiNotice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: aiNotice.ok ? COLORS.green : COLORS.red }}>
                {aiNotice.text}
              </p>
            )}

            {aiResult && (
              <div className="mt-5 rounded-xl px-4 py-4" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${RARITY[aiResultRarity]?.color || COLORS.border}` }}>
                <div className="flex items-center justify-between">
                  <p className="text-[15px] font-medium">{aiResult.name}</p>
                  <span className="text-[12px]" style={{ color: RARITY[aiResultRarity]?.color || COLORS.label }}>
                    {RARITY[aiResultRarity]?.label || aiResult.rarity}
                  </span>
                </div>
                {aiResult.description && (
                  <p className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,0.75)" }}>
                    {aiResult.description}
                  </p>
                )}
                {aiResult.lore && (
                  <p className="mt-2 text-[12px] italic" style={{ color: COLORS.label }}>
                    {aiResult.lore}
                  </p>
                )}
                {aiResult.aiVisual && (
                  <p className="mt-3 flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.accent }}>
                    <Sparkles size={13} strokeWidth={1.75} aria-hidden="true" />
                    {aiResult.aiVisual}
                  </p>
                )}
              </div>
            )}
          </section>
          </div>

          {/* ---- Right: result ---- */}
          <section className="rounded-2xl p-6" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              {t("forge.resultTitle")}
            </h2>

            {!result ? (
              <div className="mt-6 flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center" style={{ backgroundColor: "#0A0A0F", border: `1px dashed ${COLORS.border}` }}>
                <Hammer size={32} strokeWidth={1.25} style={{ color: COLORS.label }} aria-hidden="true" />
                <p className="mt-4 text-[14px]" style={{ color: COLORS.label }}>
                  {t("forge.resultEmpty")}
                </p>
              </div>
            ) : (
              <div className="forge-reveal mt-6 flex flex-col items-center rounded-xl px-6 py-10" style={{ backgroundColor: "#0A0A0F", border: `1px solid ${RARITY[resultRarity]?.color || COLORS.border}` }}>
                <span className="flex size-24 items-center justify-center rounded-2xl" style={{ border: `1px solid ${RARITY[resultRarity]?.color || COLORS.border}` }}>
                  <ResultTypeIcon size={44} strokeWidth={1.25} style={{ color: RARITY[resultRarity]?.color || COLORS.accent }} aria-hidden="true" />
                </span>
                <p className="mt-5 text-[18px] font-medium">{result.name}</p>
                <p className="mt-1 text-[13px]" style={{ color: RARITY[resultRarity]?.color || COLORS.label }}>
                  {ARTIFACT_TYPES[(result.type as ArtifactType) in ARTIFACT_TYPES ? (result.type as ArtifactType) : "artifact"].label} · {RARITY[resultRarity]?.label || result.rarity}
                </p>

                <div className="mt-6 grid w-full grid-cols-2 gap-2.5">
                  {STAT_META.map((s) => (
                    <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px]" style={{ border: `1px solid ${COLORS.border}` }}>
                      <span className="inline-flex items-center gap-1.5" style={{ color: COLORS.label }}>
                        <s.Icon size={14} strokeWidth={1.75} aria-hidden="true" />
                        {s.label}
                      </span>
                      <span>{result[s.key]}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-5 w-full rounded-lg px-4 py-3 text-[13px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <div className="flex items-center justify-between">
                    <span style={{ color: COLORS.label }}>{t("forge.recommendedPrice")}</span>
                    <span style={{ color: COLORS.accent }}>
                      {result.price.toLocaleString("ru-RU")} {result.listCurrency}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {artifacts.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 text-[13px]" style={{ color: COLORS.label }}>{t("forge.recentCreated")}</p>
                <ul className="space-y-2">
                  {artifacts.slice(0, 5).map((a) => {
                    const AIcon = ARTIFACT_TYPES[(a.type as ArtifactType) in ARTIFACT_TYPES ? (a.type as ArtifactType) : "artifact"].Icon
                    const rc = RARITY[(a.rarity as Rarity)]?.color || COLORS.border
                    const flash = upgradeFlash[a.id]
                    const isUpgrading = upgradingId === a.id
                    const atPremiumMax = a.level >= PREMIUM_MAX_LEVEL
                    const cost = premiumUpgradeCost(a.level)
                    const canAfford = wallet.timecoin >= cost
                    const aura = auraStyleForLevel(a.level, rc)
                    return (
                      <li
                        key={a.id}
                        className="relative flex flex-col gap-2 rounded-lg px-3 py-2.5 transition-transform"
                        style={{
                          ...aura,
                          transform: flash && !prefersReducedMotion ? "scale(1.03)" : "scale(1)",
                          transition: prefersReducedMotion ? "none" : "transform 0.4s ease-out",
                        }}
                      >
                        {flash && (
                          <span
                            className="pointer-events-none absolute inset-0 rounded-lg"
                            style={{
                              boxShadow: `0 0 0 2px ${flash.critical ? "#F1C40F" : COLORS.accent}88, 0 0 22px 4px ${flash.critical ? "#F1C40F" : COLORS.accent}66`,
                              transition: prefersReducedMotion ? "none" : "box-shadow 0.3s ease-out",
                            }}
                            aria-hidden="true"
                          />
                        )}

                        <div className="flex items-center gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ border: `1px solid ${rc}` }}>
                            <AIcon size={14} strokeWidth={1.75} style={{ color: rc }} aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px]">{a.name}</p>
                            <p className="text-[11px]" style={{ color: rc }}>
                              {RARITY[(a.rarity as Rarity)]?.label || a.rarity} · {t("artifacts.level", { level: a.level })}
                              {a.visualEffect && a.level >= PREMIUM_MAX_LEVEL && (
                                <span className="ml-1.5" style={{ color: "#F1C40F" }}>✦ {a.visualEffect}</span>
                              )}
                            </p>
                          </div>
                          <span className="text-[12px]" style={{ color: COLORS.label }}>
                            {a.price.toLocaleString("ru-RU")} {a.listCurrency}
                          </span>
                        </div>

                        {flash ? (
                          <p
                            className="text-center text-[12px] font-medium"
                            style={{ color: flash.critical ? "#F1C40F" : COLORS.green }}
                          >
                            {flash.critical
                              ? t("forge.premiumUpgrade.result.crit", { gain: flash.levelGain })
                              : t("forge.premiumUpgrade.result.normal", { gain: flash.levelGain })}
                          </p>
                        ) : !atPremiumMax ? (
                          <button
                            type="button"
                            onClick={() => doPremiumUpgrade(a.id)}
                            disabled={isUpgrading || !canAfford || loading}
                            title={t("forge.premiumUpgrade.tooltip", {
                              cost: fmtTC(cost),
                              chance: Math.round(PREMIUM_CRIT_CHANCE * 100),
                            })}
                            className="flex items-center justify-center gap-1.5 rounded-md py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            style={{
                              border: `1px solid ${canAfford ? "#F1C40F" : COLORS.border}`,
                              color: canAfford ? "#F1C40F" : COLORS.label,
                              backgroundColor: "rgba(241,196,15,0.06)",
                            }}
                          >
                            {isUpgrading ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Star size={13} strokeWidth={1.75} aria-hidden="true" />
                            )}
                            {t("forge.premiumUpgrade.button", { cost: fmtTC(cost) })}
                          </button>
                        ) : (
                          <p className="text-center text-[11px]" style={{ color: COLORS.label }}>
                            {t("forge.premiumUpgrade.maxed")}
                          </p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>
        </div>
      </main>

    </div>
  )
}

