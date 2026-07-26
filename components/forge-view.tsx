"use client"

import { useEffect, useRef, useState } from "react"
import { Hammer, Loader2, Sparkles, Coins, Archive, Star, Zap } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore, type OsgardArtifact, type CraftBreakdown, type ArtifactIdentity, deriveIdentityFromArtifact } from "@/lib/store/osgard-store"
import { COLORS, RARITY, RARITY_CHAIN, ARTIFACT_TYPES, STAT_META, type ArtifactType, type Rarity } from "@/lib/economy"
import { fmtTC } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"
import { SectionHelp } from "./section-help"
import { ArtifactIdentityPanel } from "./artifact-identity-panel"

const TYPE_KEYS = Object.keys(ARTIFACT_TYPES) as ArtifactType[]

/** Отключает декоративные анимации Кузницы (тряска, вспышка и т.д.) для пользователей с prefers-reduced-motion. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    Promise.resolve().then(() => setReduced(mql.matches))
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])
  return reduced
}

/** Фиксированная стоимость создания артефакта (см. backend/artifacts.routes.ts FORGE_COST_TC). */
const FORGE_COST_TC = 50

/* Ковка за любую монету, но слабее (зеркалит FORGE_CURRENCIES на бэкенде):
   слабее/дешевле валюта → ниже множитель характеристик артефакта. */
const FORGE_CURRENCIES = [
  { id: "credits", label: "Кредиты", cost: 200, mult: 0.4, color: "#00D4FF" },
  { id: "shards", label: "Шарды", cost: 80, mult: 0.6, color: "#B57BFF" },
  { id: "crystals", label: "Кристаллы", cost: 30, mult: 0.85, color: "#5AC8FA" },
  { id: "timecoin", label: "TimeCoin", cost: FORGE_COST_TC, mult: 1.0, color: "#F1C40F" },
] as const
type ForgeCurrencyId = (typeof FORGE_CURRENCIES)[number]["id"]

/** Стоимость AI-генерации артефакта (см. backend/artifacts.routes.ts AI_GENERATE_COST_TC = FORGE_COST_TC). */
const AI_GENERATE_COST_TC = FORGE_COST_TC

/** 1:1 с backend/artifacts.routes.ts DAILY_AI_GENERATION_LIMIT и mobile/types/artifact.ts DAILY_AI_GENERATION_SOFT_LIMIT. */
const DAILY_AI_GENERATION_SOFT_LIMIT = 3

/** 1:1 с mobile/design-system/colors.ts gold — цвет сегментов индикатора лимита (LimitIndicator). */
const AI_LIMIT_GOLD = "#D4AF37"

/** Число AI-сгенерированных артефактов за текущие календарные сутки (локальное время браузера). */
function countTodayAiGenerated(artifacts: OsgardArtifact[]): number {
  const now = new Date()
  return artifacts.filter((a) => {
    if (!a.source) return false
    const d = new Date(a.createdAt)
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }).length
}

function pluralizeGenerations(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return "создание"
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "создания"
  return "созданий"
}

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
    fetchTcState,
    artifacts,
    fetchArtifacts,
    forgeLoadout,
    fetchLoadout,
    forgeArtifact,
    generateAiArtifact,
    premiumUpgradeArtifact,
    projects,
    fetchProjects,
    loading,
    error,
  } = useOsgardStore()

  const [name, setName] = useState("")
  const [type, setType] = useState<ArtifactType>("neural")
  const [forgeCurrency, setForgeCurrency] = useState<ForgeCurrencyId>("timecoin")
  const [projectId, setProjectId] = useState<number | "">("")
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [result, setResult] = useState<OsgardArtifact | null>(null)
  /** Вердикт ковки к последнему result: разбор честности craftScore + нарративная идентичность. */
  const [craftBreakdown, setCraftBreakdown] = useState<CraftBreakdown | null>(null)
  const [identity, setIdentity] = useState<ArtifactIdentity | null>(null)

  /** AI-Генератор артефактов (см. POST /artifacts/generate-ai) — независимое состояние от ручной ковки. */
  const [aiHint, setAiHint] = useState("")
  const [aiSubmitting, setAiSubmitting] = useState(false)
  const [aiNotice, setAiNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [aiResult, setAiResult] = useState<OsgardArtifact | null>(null)

  /** Артефакт, уже полученный от сервера, но ещё «в кинематографе» — источник цвета вспышки/раскрытия. */
  const [revealed, setRevealed] = useState<OsgardArtifact | null>(null)

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
    const timers = flashTimers.current
    return () => {
      Object.values(timers).forEach((id) => clearTimeout(id))
    }
  }, [])


  useEffect(() => {
    fetchWallet({ skipAuthRedirect: true })
    fetchTcState({ skipAuthRedirect: true })
    fetchArtifacts({ skipAuthRedirect: true })
    fetchProjects({ skipAuthRedirect: true })
    fetchLoadout({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const TypeIcon = ARTIFACT_TYPES[type].Icon
  const selCurrency = FORGE_CURRENCIES.find((c) => c.id === forgeCurrency)!
  const forgeCost = selCurrency.cost
  const forgeBalance = (wallet as unknown as Record<string, number>)[forgeCurrency] ?? 0
  /* Скидка от честного снаряжения Кузницы (см. backend/artifacts.routes.ts POST /forge:
     paidCost = max(1, cost - round(cost*discountRate)) — та же формула, тот же результат. */
  const discountRate = forgeLoadout.discount.discountRate
  const paidCost = Math.max(1, forgeCost - Math.round(forgeCost * discountRate))
  const canForge = name.trim().length > 0 && forgeBalance >= paidCost

  // Кинематографический эффект при создании
  const [forging, setForging] = useState(false)
  const [forgePhase, setForgePhase] = useState<"idle" | "charging" | "burst" | "reveal">("idle")
  const reduceMotion = usePrefersReducedMotion()
  const anim = (value: string) => (reduceMotion ? undefined : value)

  /** Мгновенно свернуть кинематограф (авто-финал или клик «пропустить»). */
  function closeCinematic() {
    setForging(false)
    setForgePhase("idle")
    setRevealed(null)
  }

  async function doForge() {
    if (!name.trim() || submitting) return
    const forgedName = name.trim()
    setSubmitting(true)
    setForging(true)
    setForgePhase("charging")
    setNotice(null)
    setResult(null)
    setCraftBreakdown(null)
    setIdentity(null)
    setRevealed(null)

    /* Запрос уходит СРАЗУ и летит параллельно с анимацией заряда: раньше
       кинематограф добавлял ровно 1с к каждой ковке (600мс заряд + 400мс
       взрыв ДО вызова). Теперь заряд длится минимум столько, сколько нужно
       глазу, но не дольше самого запроса. */
    const call = forgeArtifact(forgedName, type, projectId === "" ? undefined : projectId, forgeCurrency)
    const minCharge = new Promise((r) => setTimeout(r, reduceMotion ? 250 : 900))

    try {
      const [res] = await Promise.all([call, minCharge])
      if (res.success && res.artifact) {
        /* Вспышка окрашивается ФАКТИЧЕСКОЙ редкостью: игрок узнаёт исход
           в момент удара, а не читает его потом мелким текстом. Раньше
           «✦ АРТЕФАКТ СОЗДАН ✦» показывалось ещё до ответа сервера — то
           есть могло соврать при отказе. */
        setRevealed(res.artifact)
        setForgePhase("burst")
        await new Promise((r) => setTimeout(r, reduceMotion ? 200 : 520))

        setForgePhase("reveal")
        setResult(res.artifact)
        setCraftBreakdown(res.craftBreakdown || null)
        setIdentity(res.identity || null)
        setNotice({ ok: true, text: `Артефакт «${res.artifact.name}» создан!` })
        setName("")
        await new Promise((r) => setTimeout(r, reduceMotion ? 500 : 1800))
        closeCinematic()
      } else {
        closeCinematic()
        setNotice({ ok: false, text: res.error || "Не удалось создать артефакт" })
      }
    } catch {
      closeCinematic()
      setNotice({ ok: false, text: "Не удалось создать артефакт" })
    } finally {
      setSubmitting(false)
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

  const todayAiCount = countTodayAiGenerated(artifacts)
  const aiLimitReached = todayAiCount >= DAILY_AI_GENERATION_SOFT_LIMIT
  const canGenerateAi = !aiSubmitting && wallet.timecoin >= AI_GENERATE_COST_TC && !aiLimitReached
  const aiResultRarity: Rarity = (aiResult?.rarity as Rarity) || "common"

  const resultRarity: Rarity = (result?.rarity as Rarity) || "common"
  const ResultTypeIcon = result ? ARTIFACT_TYPES[(result.type as ArtifactType) in ARTIFACT_TYPES ? (result.type as ArtifactType) : "artifact"].Icon : Sparkles

  /* Цвет кинематографа: пока сервер не ответил — акцент Кузницы; после ответа —
     цвет ФАКТИЧЕСКОЙ редкости выкованного предмета (dopamine-петля: исход виден
     в самой вспышке). */
  const revealRarity: Rarity = (revealed?.rarity as Rarity) || "common"
  const fxColor = revealed ? RARITY[revealRarity]?.color || COLORS.accent : COLORS.accent
  const RevealTypeIcon = revealed
    ? ARTIFACT_TYPES[(revealed.type as ArtifactType) in ARTIFACT_TYPES ? (revealed.type as ArtifactType) : "artifact"].Icon
    : Sparkles
  const resultColor = RARITY[resultRarity]?.color || COLORS.border

  /* Корень прозрачный (.eg-page — вуаль вместо глухой заливки): сквозь него
     дышит общий AmbientBackdrop. Раньше здесь был непрозрачный градиент
     #0A0A0F→#14141E, который глушил живой фон платформы. */
  return (
    <div className="eg-page min-h-screen font-sans" style={{ color: COLORS.text }}>
      <Navbar />
      <SectionHelp
        title="Кузница артефактов"
        what={`Кузница — место, где вы создаёте артефакты. У каждого есть тип, редкость и характеристики (сила / защита / магия / скорость). Артефакт можно оставить, усилить или продать на маркетплейсе. Легенда редкостей: ${RARITY_CHAIN.map((r) => `${RARITY[r].symbol} ${RARITY[r].label}`).join(" · ")}.`}
        goals={[
          { goal: "Создать первый артефакт", steps: ["Введите название", "Выберите тип", "Выберите валюту ковки", "Нажмите «Создать»"] },
          { goal: "Сэкономить на входе", steps: ["Куйте за кредиты или шарды — дешевле", "Но артефакт будет слабее (меньше статы)", "TimeCoin даёт полную силу ×1.0"] },
          { goal: "Получить уникальный артефакт", steps: ["Используйте AI-Генератор ниже", "ИИ придумает имя, лор и визуальный стиль"] },
        ]}
        tour={[
          { target: "forge-name", title: "Название артефакта", text: "Придумайте имя — например «Клинок Бесконечности». Оно будет отображаться в коллекции и на маркете." },
          { target: "forge-type", title: "Тип артефакта", text: "Выберите тип: нейросеть, кристалл, оружие, щит или артефакт. От типа зависит иконка и восприятие." },
          { target: "forge-currency", title: "Валюта ковки", text: "Выберите монету. Чем дешевле/слабее монета — тем слабее артефакт, но тем доступнее вход. TimeCoin = полная сила." },
          { target: "forge-create", title: "Создание", text: "Нажмите — артефакт выкуется, характеристики определятся случайно с учётом силы выбранной валюты." },
        ]}
      />

      {/* ===== КИНЕМАТОГРАФИЧЕСКИЙ ЭФФЕКТ КУЗНИЦЫ =====
          Три фазы: charging (запрос в полёте) → burst (вспышка ЦВЕТА
          выпавшей редкости) → reveal (материализация предмета).
          Клик по оверлею пропускает финал. */}
      {forging && (
        <div
          role="status"
          aria-live="polite"
          onClick={forgePhase === "reveal" ? closeCinematic : undefined}
          className={`fixed inset-0 z-50 flex items-center justify-center overflow-hidden ${forgePhase === "reveal" ? "cursor-pointer" : ""}`}
          style={{
            background: forgePhase === "charging"
              ? "radial-gradient(ellipse at center, rgba(10,20,35,0.95) 0%, rgba(0,0,0,0.94) 75%)"
              : `radial-gradient(ellipse at center, ${fxColor}4D 0%, rgba(0,0,0,0.97) 68%)`,
            backdropFilter: "blur(6px)",
            transition: "background 0.4s ease",
            animation: forgePhase === "burst" ? anim("forge-shake 0.45s ease-in-out") : undefined,
          }}
        >
          {/* Кинематографическая вспышка в момент взрыва — в цвете редкости */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: `radial-gradient(circle, rgba(255,255,255,0.95) 0%, ${fxColor}59 35%, transparent 70%)`,
              opacity: 0,
              animation: forgePhase === "burst" ? anim("forge-flash-overlay 0.5s ease-out forwards") : undefined,
            }}
          />

          {/* Виньетка для киношной глубины */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{ boxShadow: "inset 0 0 220px 60px rgba(0,0,0,0.85)" }}
          />

          <div className="relative flex flex-col items-center gap-8 text-center">
            {/* Центральная сфера */}
            <div
              className="relative flex items-center justify-center"
              style={{
                width: 220,
                height: 220,
              }}
            >
              {/* Вращающиеся энергетические лучи */}
              <div
                aria-hidden="true"
                className="absolute rounded-full"
                style={{
                  width: 280,
                  height: 280,
                  top: "50%",
                  left: "50%",
                  marginTop: -140,
                  marginLeft: -140,
                  background:
                    "conic-gradient(from 0deg, transparent 0deg, rgba(0,212,255,0.22) 6deg, transparent 18deg, transparent 160deg, rgba(0,212,255,0.16) 170deg, transparent 182deg, transparent 340deg, rgba(0,212,255,0.2) 352deg, transparent 360deg)",
                  animation: anim("forge-rays-spin 7s linear infinite"),
                  opacity: forgePhase === "charging" ? 1 : 0,
                  filter: "blur(1px)",
                  transition: "opacity 0.4s ease",
                }}
              />

              {/* Внешние кольца */}
              {[180, 150, 120].map((size, i) => (
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
                    border: `1.5px solid rgba(0,212,255,${0.2 + i * 0.12})`,
                    boxShadow: `0 0 ${10 + i * 6}px rgba(0,212,255,${0.15 + i * 0.08})`,
                    animation: anim(`forge-ring-spin ${3 + i * 1.5}s linear infinite ${i % 2 === 0 ? "" : "reverse"}`),
                    opacity: forgePhase === "charging" ? 1 : 0,
                    transition: "opacity 0.3s ease",
                  }}
                />
              ))}

              {/* Ударная волна при взрыве */}
              {forgePhase === "burst" && (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute rounded-full"
                    style={{
                      width: 100,
                      height: 100,
                      top: "50%",
                      left: "50%",
                      marginTop: -50,
                      marginLeft: -50,
                      border: "2px solid rgba(255,255,255,0.9)",
                      animation: anim("forge-shockwave 0.6s cubic-bezier(0.16,1,0.3,1) forwards"),
                      opacity: reduceMotion ? 0 : undefined,
                    }}
                  />
                  <div
                    aria-hidden="true"
                    className="absolute rounded-full"
                    style={{
                      width: 100,
                      height: 100,
                      top: "50%",
                      left: "50%",
                      marginTop: -50,
                      marginLeft: -50,
                      border: `2px solid ${fxColor}CC`,
                      animation: anim("forge-shockwave 0.6s cubic-bezier(0.16,1,0.3,1) 0.08s forwards"),
                      opacity: reduceMotion ? 0 : undefined,
                    }}
                  />
                </>
              )}

              {/* Центральный шар — в фазе reveal уступает место самому предмету */}
              {forgePhase !== "reveal" && (
              <div
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width: 80,
                  height: 80,
                  background: forgePhase === "burst"
                    ? `radial-gradient(circle at 35% 35%, #fff, ${fxColor} 40%, #0050FF)`
                    : "radial-gradient(circle at 35% 35%, rgba(0,212,255,0.6), rgba(0,80,255,0.3))",
                  boxShadow: forgePhase === "burst"
                    ? `0 0 90px 45px ${fxColor}D9, 0 0 170px 90px ${fxColor}66, 0 0 40px 10px rgba(255,255,255,0.9)`
                    : "0 0 30px 10px rgba(0,212,255,0.4)",
                  transition: "background 0.2s ease, box-shadow 0.2s ease",
                  animation:
                    forgePhase === "charging"
                      ? anim("forge-pulse 0.6s ease-in-out infinite")
                      : forgePhase === "burst"
                        ? anim("forge-core-flare 0.55s cubic-bezier(0.16,1,0.3,1) both")
                        : undefined,
                }}
              >
                {forgePhase === "charging" && (
                  <Zap size={32} style={{ color: "#fff" }} />
                )}
                {forgePhase === "burst" && (
                  <Sparkles size={36} style={{ color: "#fff" }} />
                )}
              </div>
              )}

              {/* ---- Материализация предмета (фаза reveal) ----
                  Взрыв оседает — из него собирается сам артефакт в ореоле
                  своей редкости. Это и есть «награда глазу» за ковку. */}
              {forgePhase === "reveal" && revealed && (
                <div className="forge-materialize relative flex flex-col items-center">
                  <span
                    className="forge-halo"
                    aria-hidden="true"
                    style={{ background: `radial-gradient(circle, ${fxColor}59 0%, transparent 68%)` }}
                  />
                  <span
                    className="relative flex size-28 items-center justify-center rounded-3xl"
                    style={{
                      border: `1px solid ${fxColor}`,
                      background: `radial-gradient(circle at 40% 30%, ${fxColor}26, rgba(6,7,12,0.85) 70%)`,
                      boxShadow: `0 0 34px 4px ${fxColor}73, inset 0 0 26px ${fxColor}33`,
                    }}
                  >
                    <RevealTypeIcon size={52} strokeWidth={1.25} style={{ color: fxColor }} aria-hidden="true" />
                  </span>

                  {/* Оседающие искры цвета редкости */}
                  {!reduceMotion &&
                    Array.from({ length: 10 }).map((_, i) => (
                      <span
                        key={i}
                        aria-hidden="true"
                        className="forge-mote pointer-events-none absolute rounded-full"
                        style={{
                          width: i % 3 === 0 ? 3 : 2,
                          height: i % 3 === 0 ? 3 : 2,
                          top: 0,
                          left: `${8 + i * 9}%`,
                          background: fxColor,
                          boxShadow: `0 0 6px ${fxColor}`,
                          animationDelay: `${(i % 5) * 0.34}s`,
                          "--mote-dx": `${(i % 2 === 0 ? 1 : -1) * (6 + (i % 4) * 5)}px`,
                        } as React.CSSProperties}
                      />
                    ))}
                </div>
              )}

              {/* Частицы при взрыве — в палитре выпавшей редкости */}
              {forgePhase === "burst" && !reduceMotion &&
                Array.from({ length: 18 }).map((_, i) => {
                  const palette = [fxColor, "#ffffff", fxColor, "#F1C40F"]
                  const color = palette[i % palette.length]
                  const big = i % 3 === 0
                  return (
                    <div
                      key={i}
                      className="absolute"
                      style={{
                        width: big ? 4 : 2.5,
                        height: big ? 18 : 11,
                        borderRadius: 999,
                        top: "50%",
                        left: "50%",
                        marginTop: big ? -9 : -5.5,
                        marginLeft: big ? -2 : -1.25,
                        background: `linear-gradient(${color}, transparent)`,
                        boxShadow: `0 0 6px ${color}`,
                        animation: "forge-particle-burst 0.75s cubic-bezier(0.16,1,0.3,1) forwards",
                        animationDelay: `${(i % 9) * 0.02}s`,
                        transformOrigin: "center center",
                        "--particle-angle": `${i * (360 / 18)}deg`,
                      } as React.CSSProperties}
                    />
                  )
                })}
            </div>

            {/* Текст фазы. «Артефакт создан» произносится ТОЛЬКО после ответа
                сервера (фазы burst/reveal наступают уже с результатом на руках). */}
            <div>
              <p
                key={forgePhase}
                className="text-[24px] font-semibold tracking-widest uppercase"
                style={{
                  color: forgePhase === "charging" ? "#00D4FF" : "#fff",
                  textShadow:
                    forgePhase === "charging"
                      ? "0 0 18px rgba(0,212,255,0.35)"
                      : `0 0 30px ${fxColor}E6, 0 0 60px ${fxColor}80`,
                  letterSpacing: "0.22em",
                  animation: anim("forge-text-pop 0.5s cubic-bezier(0.16,1,0.3,1) both"),
                }}
              >
                {forgePhase === "charging"
                  ? "ЗАРЯЖАЕМ КУЗНИЦУ"
                  : forgePhase === "burst"
                    ? "✦  АРТЕФАКТ СОЗДАН  ✦"
                    : RARITY[revealRarity]?.label || "ГОТОВО"}
              </p>
              <p className="mt-2 text-[13px]" style={{ color: forgePhase === "reveal" ? fxColor : "rgba(255,255,255,0.5)" }}>
                {forgePhase === "charging"
                  ? "Накапливаем энергию TimeCoin..."
                  : revealed?.name || name || "Новый артефакт"}
              </p>
              {forgePhase === "reveal" && (
                <p className="mt-3 text-[11px] uppercase tracking-[0.2em]" style={{ color: "rgba(255,255,255,0.32)" }}>
                  нажмите, чтобы продолжить
                </p>
              )}
            </div>

            {/* Прогресс-бар — на раскрытии окрашен редкостью */}
            <div className="relative w-48 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.1)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  background: forgePhase === "charging"
                    ? "linear-gradient(90deg, #00D4FF, #B57BFF, #00D4FF)"
                    : `linear-gradient(90deg, ${fxColor}, #ffffff, ${fxColor})`,
                  backgroundSize: "220% 100%",
                  width: forgePhase === "charging" ? "60%" : "100%",
                  transition: "width 0.6s ease",
                  boxShadow: `0 0 12px ${forgePhase === "charging" ? "rgba(0,212,255,0.7)" : `${fxColor}B3`}`,
                  animation: anim("forge-progress-shimmer 1.4s linear infinite"),
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
            { n: `${paidCost} ${selCurrency.label}`, l: t("forge.creationCost"), Icon: Hammer, c: selCurrency.color },
            { n: `${artifacts.length}`, l: t("forge.artifactsInCollection"), Icon: Archive, c: "#9B59B6" },
          ].map((m) => (
            <div key={m.l} className="eg-surface premium-card rounded-xl p-5">
              <m.Icon size={18} strokeWidth={1.5} style={{ color: m.c }} aria-hidden="true" />
              <p className="mt-3 text-[22px] font-medium leading-none">{m.n}</p>
              <p className="mt-2 text-[12px]" style={{ color: COLORS.label }}>{m.l}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.9fr]">
          {/* ---- Left: creation form + AI-генератор ---- */}
          <div className="flex flex-col gap-6">
          <section className="eg-surface rounded-2xl p-6">
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
                data-tour="forge-name"
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
              <div className="flex flex-wrap gap-2" data-tour="forge-type">
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

            {/* Project link (опционально) */}
            {projects.length > 0 && (
              <div className="mt-5">
                <label htmlFor="forge-project" className="mb-2 block text-[13px]" style={{ color: COLORS.label }}>
                  {t("forge.projectLabel")}
                </label>
                <select
                  id="forge-project"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
                  className="cal-input"
                >
                  <option value="">{t("forge.projectNone")}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Валюта ковки — любая монета, но слабее. Множитель масштабирует СУММУ всех
                характеристик (см. backend/proof-of-craft.ts targetSum), а не «силу» отдельно —
                как распределяется сумма по 4 статам, намеренно не раскрываем (red-team). */}
            <div className="mt-5" data-tour="forge-currency">
              <p className="mb-2 text-[13px]" style={{ color: COLORS.label }}>
                {t("forge.currency.label")}
              </p>
              <div className="flex flex-wrap gap-2">
                {FORGE_CURRENCIES.map((c) => {
                  const active = forgeCurrency === c.id
                  const bal = (wallet as unknown as Record<string, number>)[c.id] ?? 0
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setForgeCurrency(c.id)}
                      aria-pressed={active}
                      className="rounded-lg px-3 py-2 text-left text-[12px] transition-colors"
                      style={{
                        border: `1px solid ${active ? c.color : COLORS.border}`,
                        backgroundColor: active ? `${c.color}14` : "transparent",
                        color: active ? c.color : "rgba(255,255,255,0.7)",
                      }}
                    >
                      <span className="block font-medium">{c.label}</span>
                      <span className="block" style={{ color: COLORS.label }}>
                        {c.cost} · ×{c.mult}
                      </span>
                      <span className="block" style={{ color: active ? c.color : "rgba(255,255,255,0.5)" }}>
                        {t("forge.currency.percentOf", { percent: Math.round(c.mult * 100) })}
                      </span>
                      <span className="block text-[11px]" style={{ color: bal >= c.cost ? COLORS.green : COLORS.red }}>
                        {t("forge.currency.balance")} {bal}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="mt-2 text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                {t("forge.currency.explain")}
              </p>
            </div>

            {/* Rarity info (сервер решает сам) */}
            <div className="eg-inset mt-5 rounded-lg p-4 text-[13px]">
              <p style={{ color: COLORS.label }}>
                <Sparkles size={13} strokeWidth={1.75} className="mr-1.5 inline-block align-[-2px]" style={{ color: RARITY.common.color }} aria-hidden="true" />
                {t("forge.rarityInfo")}
              </p>
            </div>

            {/* Cost breakdown */}
            <div className="eg-inset mt-4 space-y-2 rounded-lg p-4 text-[13px]">
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("forge.creationCost")}</span>
                {discountRate > 0 ? (
                  <span className="flex items-baseline gap-1.5">
                    <span className="line-through" style={{ color: COLORS.label }}>{forgeCost}</span>
                    <span className="font-medium" style={{ color: COLORS.green }}>{paidCost} {selCurrency.label}</span>
                  </span>
                ) : (
                  <span>{forgeCost} {selCurrency.label}</span>
                )}
              </div>
              {discountRate > 0 && (
                <div className="flex items-center justify-between">
                  <span style={{ color: "#F1C40F" }} title={t("forge.discount.tooltip")}>
                    {t("forge.discount.label")}
                  </span>
                  <span style={{ color: "#F1C40F" }}>
                    {t("forge.discount.value", { percent: Math.round(discountRate * 100) })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span style={{ color: COLORS.label }}>{t("forge.yourBalanceLabel")}</span>
                <span style={{ color: forgeBalance >= paidCost ? COLORS.green : COLORS.red }}>
                  {forgeBalance} {selCurrency.label}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1" style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <span>{t("forge.remainingAfter")}</span>
                <span className="text-[15px] font-medium" style={{ color: "#FFFFFF" }}>
                  {Math.max(0, forgeBalance - paidCost)} {selCurrency.label}
                </span>
              </div>
            </div>

            <button
              type="button"
              data-tour="forge-create"
              onClick={doForge}
              disabled={!canForge || submitting}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: COLORS.accent, color: COLORS.bg }}
            >
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {t("forge.createBtn", { amount: `${paidCost} ${selCurrency.label}` })}
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
          <section className="eg-surface rounded-2xl p-6">
            <h2 className="flex items-center gap-2 text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              <Sparkles size={16} strokeWidth={1.75} style={{ color: COLORS.accent }} aria-hidden="true" />
              {t("forge.aiGenerate.title")}
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("forge.aiGenerate.subtitle")}
            </p>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Zap size={14} style={{ color: aiLimitReached ? COLORS.label : AI_LIMIT_GOLD }} aria-hidden="true" />
                <span className="text-[12px]" style={{ color: aiLimitReached ? COLORS.label : "#FFFFFF" }}>
                  {aiLimitReached
                    ? t("forge.aiGenerate.limitDepleted")
                    : t("forge.aiGenerate.limitRemaining", {
                        count: DAILY_AI_GENERATION_SOFT_LIMIT - todayAiCount,
                        noun: pluralizeGenerations(DAILY_AI_GENERATION_SOFT_LIMIT - todayAiCount),
                      })}
                </span>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: DAILY_AI_GENERATION_SOFT_LIMIT }).map((_, i) => (
                  <div key={i} className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: COLORS.border }}>
                    {i < DAILY_AI_GENERATION_SOFT_LIMIT - todayAiCount && (
                      <div className="h-full w-full rounded-full" style={{ backgroundColor: AI_LIMIT_GOLD }} />
                    )}
                  </div>
                ))}
              </div>
            </div>

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
              title={
                aiLimitReached
                  ? t("forge.aiGenerate.limitDepleted")
                  : wallet.timecoin < AI_GENERATE_COST_TC
                    ? t("forge.aiGenerate.button", { amount: fmtTC(AI_GENERATE_COST_TC) })
                    : undefined
              }
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: "transparent", border: `1px solid ${COLORS.accent}`, color: COLORS.accent }}
            >
              {aiSubmitting && <Loader2 size={16} className="animate-spin" />}
              {t("forge.aiGenerate.button", { amount: fmtTC(AI_GENERATE_COST_TC) })}
            </button>

            {!aiNotice && !aiSubmitting && (aiLimitReached || wallet.timecoin < AI_GENERATE_COST_TC) && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: COLORS.red }}>
                {aiLimitReached
                  ? t("forge.aiGenerate.limitDepleted")
                  : t("forge.aiGenerate.needMore", { amount: fmtTC(AI_GENERATE_COST_TC) })}
              </p>
            )}

            {aiNotice && (
              <p className="mt-3 text-[13px]" role="status" style={{ color: aiNotice.ok ? COLORS.green : COLORS.red }}>
                {aiNotice.text}
              </p>
            )}

            {aiResult && (
              <div className="eg-inset mt-5 rounded-xl px-4 py-4" style={{ borderColor: RARITY[aiResultRarity]?.color || undefined }}>
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
          <section className="eg-surface rounded-2xl p-6">
            <h2 className="text-[16px] font-semibold uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
              {t("forge.resultTitle")}
            </h2>

            {!result ? (
              <div className="eg-inset mt-6 flex flex-col items-center justify-center rounded-xl px-6 py-16 text-center" style={{ borderStyle: "dashed" }}>
                <Hammer size={32} strokeWidth={1.25} style={{ color: COLORS.label }} aria-hidden="true" />
                <p className="mt-4 text-[14px]" style={{ color: COLORS.label }}>
                  {t("forge.resultEmpty")}
                </p>
              </div>
            ) : (
              <div
                className="forge-reveal eg-inset mt-6 flex flex-col items-center rounded-xl px-6 py-10"
                style={{
                  borderColor: resultColor,
                  boxShadow: `0 0 40px 4px ${resultColor}33`,
                }}
              >
                <div className="forge-reveal-shine" aria-hidden="true" />
                <span
                  className="relative flex size-24 items-center justify-center rounded-2xl"
                  style={{
                    border: `1px solid ${resultColor}`,
                    background: `radial-gradient(circle at 40% 30%, ${resultColor}1F, transparent 70%)`,
                    boxShadow: `0 0 24px 2px ${resultColor}55`,
                  }}
                >
                  {/* Дышащий ореол редкости — предмет «живой», а не картинка. */}
                  <span
                    className="forge-halo"
                    aria-hidden="true"
                    style={{ background: `radial-gradient(circle, ${resultColor}40 0%, transparent 68%)` }}
                  />
                  <ResultTypeIcon size={44} strokeWidth={1.25} style={{ color: resultColor, position: "relative" }} aria-hidden="true" />
                </span>
                <p className="mt-5 text-[18px] font-medium">{result.name}</p>
                <p className="mt-1 text-[13px]" style={{ color: RARITY[resultRarity]?.color || COLORS.label }}>
                  {ARTIFACT_TYPES[(result.type as ArtifactType) in ARTIFACT_TYPES ? (result.type as ArtifactType) : "artifact"].label} · {RARITY[resultRarity]?.label || result.rarity}
                </p>

                {/* ---- Легенда + честность ковки — сначала нарратив, потом голые цифры.
                    Обе фичи уже полностью считает бэкенд (proof-of-craft.ts,
                    artifact-identity.ts) — здесь они впервые становятся видимы игроку. */}
                {identity ? (
                  <div className="mt-6 w-full">
                    <ArtifactIdentityPanel identity={identity} craftBreakdown={craftBreakdown} accentColor={resultColor} />
                    {craftBreakdown && (
                      <p className="mt-2 text-center text-[11px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                        {t("forge.verdict.theoreticalMax", {
                          sum: Math.round((result.power + result.defense + result.magic + result.speed) / selCurrency.mult),
                        })}
                      </p>
                    )}
                  </div>
                ) : (
                  craftBreakdown && (
                    <div className="eg-inset mt-5 w-full rounded-lg px-4 py-4 text-[13px]">
                      <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                        {t("forge.verdict.intro")}
                      </p>
                      <div className="mt-2.5 flex items-center justify-between">
                        <span style={{ color: COLORS.label }}>{t("forge.verdict.title")}</span>
                        <span style={{ color: resultColor }}>{Math.round(craftBreakdown.craftScore * 100)}%</span>
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {craftBreakdown.factors.map((f) => (
                          <div key={f.key}>
                            <div className="flex items-center justify-between text-[12px]">
                              <span style={{ color: "rgba(255,255,255,0.75)" }}>{f.label}</span>
                              <span style={{ color: COLORS.label }}>{f.detail}</span>
                            </div>
                            <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${f.maxPoints > 0 ? Math.min(100, (f.points / f.maxPoints) * 100) : 0}%`,
                                  background: "linear-gradient(90deg, #B8862E, #F1C40F, #FFE9A8)",
                                  transition: reduceMotion ? "none" : "width 0.6s ease-out",
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                )}

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

                <div className="eg-inset mt-5 w-full rounded-lg px-4 py-3 text-[13px]">
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
                            {/* Идентичность выводится локально из уже загруженных originMyth/visualTheme
                                (GET /mine) — без дополнительного запроса на карточку. */}
                            {(() => {
                              const recentIdentity = deriveIdentityFromArtifact(a)
                              return recentIdentity ? (
                                <div className="mt-0.5">
                                  <ArtifactIdentityPanel identity={recentIdentity} compact accentColor={rc} />
                                </div>
                              ) : null
                            })()}
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

