"use client"

/* ================================================================
   PricingView — страница тарифных планов OSGARD
   ----------------------------------------------------------------
   Отображает 4 тарифа: Гость / Пользователь / Pro (Architect) /
   Supreme (Legend) с детализацией AI-лимитов и кнопками подписки
   через Stripe Checkout.

   Логика:
   - Гость и Пользователь (free) — без оплаты
   - Pro ($19/мес) → plan = "architect"
   - Supreme ($99/мес) → план = "legend" (включает оркестратор)
   - Если Stripe не настроен — mock-режим (dev), подписка активируется
     локально через POST /subscription/create-checkout
   ================================================================ */

import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Check,
  Zap,
  Crown,
  Star,
  Sparkles,
  Bot,
  GitBranch,
  Infinity,
  Users,
  Shield,
  ChevronRight,
  ChevronDown,
  Loader2,
  Palette,
  GraduationCap,
  Lock,
  X,
} from "lucide-react"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

/* ── Палитра ───────────────────────────────────────────────────── */
const BG     = "#0A0A0F"
const CARD   = "#14141E"
const BORDER = "#2A2A3E"
const LABEL  = "#6A6A8A"

/* ── Типы ──────────────────────────────────────────────────────── */
type PlanId = "guest" | "free" | "architect" | "legend"

interface PlanDef {
  id:          PlanId
  name:        string
  subtitle:    string
  price:       number | null   // null = бесплатно / гость
  priceLabel:  string
  color:       string
  glow:        string
  Icon:        React.FC<{ size?: number; style?: React.CSSProperties }>
  badge?:      string
  features:    { text: string; highlight?: boolean }[]
  aiLimits?:   { claude: string; grok: string; deepseek: string; total: string }
  cta:         string
  ctaHref?:    string          // если не требует API-вызова
  stripePlan?: "architect" | "master" | "legend"
}

/* ── Планы ─────────────────────────────────────────────────────── */
const PLANS: PlanDef[] = [
  {
    id:         "guest",
    name:       "Гость",
    subtitle:   "Попробуй без регистрации",
    price:      null,
    priceLabel: "Бесплатно",
    color:      "#6A6A8A",
    glow:       "rgba(106,106,138,0.15)",
    Icon:       Users,
    features: [
      { text: "3 AI-демо-генерации за всё время" },
      { text: "Просмотр маркетплейса" },
      { text: "Просмотр лендинга и документации" },
    ],
    aiLimits: { claude: "—", grok: "—", deepseek: "—", total: "3 демо" },
    cta:     "Попробовать",
    ctaHref: "/",
  },
  {
    id:         "free",
    name:       "Пользователь",
    subtitle:   "После регистрации",
    price:      0,
    priceLabel: "Бесплатно",
    color:      "#06B6D4",
    glow:       "rgba(6,182,212,0.15)",
    Icon:       Zap,
    features: [
      { text: "5 AI-генераций проектов/день" },
      { text: "ДЖАРВИС — безлимит (OS 3.0)" },
      { text: "ВАЛЛИ — советник и 3D-комната" },
      { text: "БЛИЗНЕЦ — обучение на артефактах" },
      { text: "Маркетплейс и торговля" },
      { text: "Кошелёк и TimeCoin" },
    ],
    aiLimits: { claude: "1/день", grok: "2/день", deepseek: "2/день", total: "5/день" },
    cta:     "Зарегистрироваться",
    ctaHref: "/register",
  },
  {
    id:         "architect",
    name:       "Pro",
    subtitle:   "Для активных создателей",
    price:      19,
    priceLabel: "$19 / мес",
    color:      "#A855F7",
    glow:       "rgba(168,85,247,0.2)",
    Icon:       Crown,
    badge:      "Популярный",
    features: [
      { text: "15 AI-генераций проектов/день",      highlight: true },
      { text: "2 OS 5.0 + 4 OS 3.3 + 9 OS 3.0/день", highlight: true },
      { text: "ДЖАРВИС — безлимит" },
      { text: "ВАЛЛИ + БЛИЗНЕЦ — полный доступ" },
      { text: "Деплой на Netlify" },
      { text: "GitHub-публикация проектов" },
      { text: "Приоритетная генерация" },
    ],
    aiLimits: { claude: "2/день", grok: "4/день", deepseek: "9/день", total: "15/день" },
    cta:        "Подключить Pro",
    stripePlan: "architect",
  },
  {
    id:         "legend",
    name:       "Supreme",
    subtitle:   "Без ограничений",
    price:      99,
    priceLabel: "$99 / мес",
    color:      "#F59E0B",
    glow:       "rgba(245,158,11,0.2)",
    Icon:       Star,
    badge:      "Максимум",
    features: [
      { text: "Безлимит AI-генераций",              highlight: true },
      { text: "OS 5.0 / OS 3.3 / OS 3.0 — безлимит", highlight: true },
      { text: "Оркестратор — 10 цепочек/день",       highlight: true },
      { text: "ДЖАРВИС + ВАЛЛИ + БЛИЗНЕЦ — всё" },
      { text: "2 OS 5.0 + 4 OS 3.3 + 4 OS 3.0 в оркестраторе" },
      { text: "Деплой + GitHub + Netlify" },
      { text: "Ранний доступ к новым фичам" },
    ],
    aiLimits: { claude: "∞", grok: "∞", deepseek: "∞", total: "∞" },
    cta:        "Подключить Supreme",
    stripePlan: "legend",
  },
]

/* ── Addon-подписки: ДЖАРВИС / ВАЛЛИ Premium ──────────────────────
   Параллельная (не иерархическая) система, независимая от PLANS выше.
   Оба ключа фиксированы по $99/мес, без скидок за покупку обоих сразу.
   Прогрессия (уровень/XP/tier) — за активность, elite не продаётся
   отдельно, а зарабатывается. См. backend/src/lib/addons.ts. */
type AddonProductKey = "jarvis" | "walli"
type AddonKey = "jarvis_premium" | "walli_premium"

/* Должно совпадать с XP_PER_LEVEL в backend/src/lib/addonProgression.ts — используется только для отображения прогресс-бара. */
const ADDON_XP_PER_LEVEL = 100

interface AddonStatusEntry {
  addonKey:           AddonKey
  status:             string
  currentPeriodStart: number | null
  currentPeriodEnd:   number | null
  cancelAtPeriodEnd:  boolean
  canceledAt:         number | null
  product:            AddonProductKey
  progress:           { level: number; xp: number; tier: "premium" | "elite" }
}

interface CustomizationState {
  customName: string | null
  themeKey:   string | null
  voiceKey:   string | null
}

interface UnlockEntry {
  option_type: "theme" | "voice"
  option_key:  string
  unlocked_at: number
}

interface CourseEntry {
  courseKey:    string
  title:        string
  description:  string | null
  requiredTier: "premium" | "elite"
  xpReward:     number
  locked:       boolean
  status:       "not_started" | "in_progress" | "completed"
  progressPct:  number
}

interface AddonDef {
  key:      AddonKey
  product:  AddonProductKey
  name:     string
  subtitle: string
  color:    string
  glow:     string
  Icon:     React.FC<{ size?: number; style?: React.CSSProperties }>
  features: string[]
}

const ADDON_DEFS: AddonDef[] = [
  {
    key:      "jarvis_premium",
    product:  "jarvis",
    name:     "ДЖАРВИС Premium",
    subtitle: "Прокачанный AI-советник",
    color:    "#06B6D4",
    glow:     "rgba(6,182,212,0.2)",
    Icon:     Bot,
    features: [
      "Кастомное имя, тема оформления и голос",
      "Обучающие курсы по продукту",
      "Прогрессия за активность — уровни и опыт (XP)",
      "Elite-статус зарабатывается прогрессом, не покупается",
    ],
  },
  {
    key:      "walli_premium",
    product:  "walli",
    name:     "ВАЛЛИ Premium",
    subtitle: "Прокачанный 3D-советник",
    color:    "#A855F7",
    glow:     "rgba(168,85,247,0.2)",
    Icon:     Sparkles,
    features: [
      "Кастомное имя, тема оформления и голос",
      "Обучающие курсы по продукту",
      "Прогрессия за активность — уровни и опыт (XP)",
      "Elite-статус зарабатывается прогрессом, не покупается",
    ],
  },
]

/* ── AI-ассистенты ─────────────────────────────────────────────── */
const AI_AGENTS = [
  {
    name:  "ДЖАРВИС",
    Icon:  Bot,
    color: "#06B6D4",
    desc:  "Советник, чат, помощь с артефактами — безлимит на OS 3.0/OS 5.0 для всех зарегистрированных пользователей.",
  },
  {
    name:  "ВАЛЛИ",
    Icon:  Sparkles,
    desc:  "AI-советник в чате и 3D-комнате. Поддерживает команду «Запусти цепочку».",
    color: "#A855F7",
  },
  {
    name:  "БЛИЗНЕЦ",
    Icon:  Infinity,
    color: "#34D399",
    desc:  "Цифровой двойник, обученный на ваших артефактах. Генерирует новые в вашем стиле.",
  },
  {
    name:  "Оркестратор",
    Icon:  GitBranch,
    color: "#F59E0B",
    desc:  "Цепочки нейросетей OSGARD (OS 5.0 → OS 3.3 → OS 3.0). Доступен на тарифах Master и Supreme.",
  },
]

/* ── Компонент ─────────────────────────────────────────────────── */
export function PricingView() {
  const { user } = useAuth()
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  /* Загружаем текущий план подписки */
  useEffect(() => {
    if (!user) return
    apiClient
      .get<{ subscription: { plan: string } }>("/subscription/status")
      .then((r) => setCurrentPlan(r.subscription.plan))
      .catch(() => setCurrentPlan("free"))
  }, [user])

  async function handleSubscribe(plan: PlanDef) {
    if (!plan.stripePlan) return
    if (!user) {
      setNotice({ ok: false, text: "Войдите или зарегистрируйтесь для оформления подписки" })
      return
    }

    setLoading(true)
    setCheckoutPlan(plan.stripePlan)
    setNotice(null)

    try {
      const res = await apiClient.post<{ mock?: boolean; url?: string; subscription?: any }>(
        "/subscription/create-checkout",
        { plan: plan.stripePlan },
      )

      if (res.mock) {
        setCurrentPlan(plan.stripePlan)
        setNotice({ ok: true, text: `✅ Подписка «${plan.name}» активирована (dev-режим)` })
      } else if (res.url) {
        window.location.href = res.url
      }
    } catch (err: any) {
      setNotice({ ok: false, text: err?.message || "Ошибка оформления подписки" })
    } finally {
      setLoading(false)
      setCheckoutPlan(null)
    }
  }

  /* ── Addon-подписки: ДЖАРВИС / ВАЛЛИ Premium ── */
  const [addonStatus, setAddonStatus] = useState<Partial<Record<AddonKey, AddonStatusEntry>> | null>(null)
  const [addonBusy, setAddonBusy] = useState<AddonKey | null>(null)
  const [addonNotice, setAddonNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [openPanel, setOpenPanel] = useState<AddonProductKey | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const [customization, setCustomization] = useState<Partial<Record<AddonProductKey, CustomizationState>>>({})
  const [unlocks, setUnlocks] = useState<Partial<Record<AddonProductKey, UnlockEntry[]>>>({})
  const [courses, setCourses] = useState<Partial<Record<AddonProductKey, CourseEntry[]>>>({})
  const [customNameInput, setCustomNameInput] = useState("")
  const [savingCustomName, setSavingCustomName] = useState(false)

  function refreshAddonStatus() {
    return apiClient
      .get<{ addons: AddonStatusEntry[] }>("/addons/status")
      .then((r) => {
        const map: Partial<Record<AddonKey, AddonStatusEntry>> = {}
        r.addons.forEach((a) => { map[a.addonKey] = a })
        setAddonStatus(map)
      })
      .catch(() => {})
  }

  useEffect(() => {
    if (!user) return
    refreshAddonStatus()
  }, [user])

  async function handleAddonSubscribe(addonKey: AddonKey) {
    if (!user) {
      setAddonNotice({ ok: false, text: "Войдите или зарегистрируйтесь для оформления подписки" })
      return
    }

    setAddonBusy(addonKey)
    setAddonNotice(null)

    try {
      const res = await apiClient.post<{ mock?: boolean; url?: string }>("/addons/create-checkout", { addonKey })

      if (res.mock) {
        await refreshAddonStatus()
        setAddonNotice({ ok: true, text: "✅ Premium-подписка активирована (dev-режим)" })
      } else if (res.url) {
        window.location.href = res.url
      }
    } catch (err: any) {
      setAddonNotice({ ok: false, text: err?.message || "Ошибка оформления подписки" })
    } finally {
      setAddonBusy(null)
    }
  }

  async function handleAddonCancel(addonKey: AddonKey) {
    setAddonBusy(addonKey)
    setAddonNotice(null)

    try {
      await apiClient.post("/addons/cancel", { addonKey })
      await refreshAddonStatus()
      setAddonNotice({ ok: true, text: "Подписка будет отменена в конце оплаченного периода" })
    } catch (err: any) {
      setAddonNotice({ ok: false, text: err?.message || "Не удалось отменить подписку" })
    } finally {
      setAddonBusy(null)
    }
  }

  async function togglePanel(product: AddonProductKey) {
    if (openPanel === product) {
      setOpenPanel(null)
      return
    }

    setOpenPanel(product)
    setPanelLoading(true)

    try {
      const [custRes, coursesRes] = await Promise.all([
        apiClient.get<{ customization: CustomizationState; unlocks: UnlockEntry[] }>(`/addons/customization/${product}`),
        apiClient.get<{ courses: CourseEntry[] }>(`/addons/courses/${product}`),
      ])
      setCustomization((prev) => ({ ...prev, [product]: custRes.customization }))
      setUnlocks((prev) => ({ ...prev, [product]: custRes.unlocks }))
      setCourses((prev) => ({ ...prev, [product]: coursesRes.courses }))
      setCustomNameInput(custRes.customization.customName || "")
    } catch (err: any) {
      setAddonNotice({ ok: false, text: err?.message || "Не удалось загрузить панель Premium" })
      setOpenPanel(null)
    } finally {
      setPanelLoading(false)
    }
  }

  async function saveCustomName(product: AddonProductKey) {
    setSavingCustomName(true)
    try {
      const res = await apiClient.put<{ customization: CustomizationState }>(`/addons/customization/${product}`, {
        customName: customNameInput.trim() || null,
      })
      setCustomization((prev) => ({ ...prev, [product]: res.customization }))
    } catch (err: any) {
      setAddonNotice({ ok: false, text: err?.message || "Не удалось сохранить имя" })
    } finally {
      setSavingCustomName(false)
    }
  }

  async function applyUnlockedOption(product: AddonProductKey, type: "theme" | "voice", key: string) {
    try {
      const body = type === "theme" ? { themeKey: key } : { voiceKey: key }
      const res = await apiClient.put<{ customization: CustomizationState }>(`/addons/customization/${product}`, body)
      setCustomization((prev) => ({ ...prev, [product]: res.customization }))
    } catch (err: any) {
      setAddonNotice({ ok: false, text: err?.message || "Не удалось применить вариант" })
    }
  }

  async function markCourseComplete(product: AddonProductKey, courseKey: string) {
    try {
      await apiClient.post(`/addons/courses/${product}/${courseKey}/progress`, {
        progressPct: 100,
        status: "completed",
      })
      setCourses((prev) => ({
        ...prev,
        [product]: (prev[product] || []).map((c) =>
          c.courseKey === courseKey ? { ...c, status: "completed" as const, progressPct: 100 } : c,
        ),
      }))
      await refreshAddonStatus()
    } catch (err: any) {
      setAddonNotice({ ok: false, text: err?.message || "Не удалось обновить прогресс курса" })
    }
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: `linear-gradient(180deg, ${BG} 0%, #0F0F1A 100%)`, color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-[1200px] px-6 py-14 md:px-10 md:py-20">

        {/* ── Заголовок ── */}
        <div className="text-center mb-14">
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-medium mb-5 tracking-wide"
            style={{ background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.2)", color: "#06B6D4" }}
          >
            <Shield size={12} />
            Тарифные планы
          </div>
          <h1 className="text-[36px] sm:text-[52px] font-bold leading-tight tracking-[-0.03em] mb-4">
            Выбери свой путь
          </h1>
          <p className="text-[16px] max-w-xl mx-auto leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            От гостевого демо до полного безлимита — OS 5.0, OS 3.3 и OS 3.0 работают на тебя.
          </p>
        </div>

        {/* ── Уведомление ── */}
        {notice && (
          <div
            className="mb-8 mx-auto max-w-lg rounded-xl px-5 py-3 text-[14px] text-center"
            style={{
              background: notice.ok ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${notice.ok ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
              color: notice.ok ? "#34D399" : "#F87171",
            }}
          >
            {notice.text}
          </div>
        )}

        {/* ── Карточки тарифов ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-16">
          {PLANS.map((plan) => {
            const isActive = currentPlan === plan.id || (plan.id === "free" && currentPlan === "free" && !!user)
            const isBusy   = loading && checkoutPlan === plan.stripePlan
            const isPopular = !!plan.badge

            return (
              <div
                key={plan.id}
                className="relative flex flex-col rounded-2xl overflow-hidden transition-transform duration-200 hover:-translate-y-1"
                style={{
                  background: CARD,
                  border: isActive
                    ? `1px solid ${plan.color}`
                    : isPopular
                    ? `1px solid ${plan.color}50`
                    : `1px solid ${BORDER}`,
                  boxShadow: isActive
                    ? `0 0 30px ${plan.glow}, 0 0 0 1px ${plan.color}30`
                    : isPopular
                    ? `0 0 20px ${plan.glow}`
                    : "none",
                }}
              >
                {/* Бейдж популярного */}
                {plan.badge && (
                  <div
                    className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
                    style={{ background: `${plan.color}20`, border: `1px solid ${plan.color}40`, color: plan.color }}
                  >
                    {plan.badge}
                  </div>
                )}

                {/* Активный бейдж */}
                {isActive && (
                  <div
                    className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide"
                    style={{ background: `${plan.color}20`, border: `1px solid ${plan.color}40`, color: plan.color }}
                  >
                    Ваш план
                  </div>
                )}

                <div className="p-6 flex flex-col flex-1">
                  {/* Иконка + название */}
                  <div className="flex items-center gap-3 mb-5 mt-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${plan.color}18`, border: `1px solid ${plan.color}30` }}
                    >
                      <plan.Icon size={18} style={{ color: plan.color }} />
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold leading-tight">{plan.name}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: LABEL }}>{plan.subtitle}</p>
                    </div>
                  </div>

                  {/* Цена */}
                  <div className="mb-6">
                    <span className="text-[32px] font-bold leading-none" style={{ color: plan.price ? plan.color : "#FFFFFF" }}>
                      {plan.price === null || plan.price === 0 ? plan.priceLabel : `$${plan.price}`}
                    </span>
                    {plan.price !== null && plan.price > 0 && (
                      <span className="text-[13px] ml-1" style={{ color: LABEL }}>/мес</span>
                    )}
                  </div>

                  {/* AI-лимиты */}
                  {plan.aiLimits && (
                    <div
                      className="mb-5 rounded-xl p-3 text-[11px] space-y-1.5"
                      style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.1em] mb-2" style={{ color: LABEL }}>AI-лимиты / день</p>
                      {[
                        { label: "OS 5.0",   value: plan.aiLimits.claude,   color: "#F59E0B" },
                        { label: "OS 3.3",     value: plan.aiLimits.grok,     color: "#A855F7" },
                        { label: "OS 3.0", value: plan.aiLimits.deepseek, color: "#06B6D4" },
                        { label: "Итого",    value: plan.aiLimits.total,    color: "#34D399" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex items-center justify-between">
                          <span style={{ color: LABEL }}>{label}</span>
                          <span className="font-medium" style={{ color }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Фичи */}
                  <ul className="flex-1 space-y-2 mb-6">
                    {plan.features.map((f) => (
                      <li key={f.text} className="flex items-start gap-2 text-[13px]">
                        <Check
                          size={13}
                          className="mt-0.5 shrink-0"
                          style={{ color: f.highlight ? plan.color : "#34D399" }}
                        />
                        <span style={{ color: f.highlight ? "#FFFFFF" : "rgba(255,255,255,0.65)" }}>
                          {f.text}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {plan.ctaHref ? (
                    <Link
                      href={plan.ctaHref}
                      className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-[14px] font-semibold transition-all duration-200 hover:opacity-90"
                      style={
                        isActive
                          ? { background: `${plan.color}20`, border: `1px solid ${plan.color}40`, color: plan.color }
                          : { background: `${plan.color}15`, border: `1px solid ${plan.color}30`, color: plan.color }
                      }
                    >
                      {plan.cta}
                      <ChevronRight size={14} />
                    </Link>
                  ) : isActive ? (
                    <div
                      className="flex items-center justify-center w-full rounded-xl py-3 text-[14px] font-semibold"
                      style={{ background: `${plan.color}15`, border: `1px solid ${plan.color}40`, color: plan.color }}
                    >
                      ✓ Активен
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSubscribe(plan)}
                      disabled={loading}
                      className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-[14px] font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={
                        isPopular
                          ? { background: `linear-gradient(135deg, ${plan.color}, ${plan.color}cc)`, color: "#000" }
                          : { background: `${plan.color}15`, border: `1px solid ${plan.color}30`, color: plan.color }
                      }
                    >
                      {isBusy ? <Loader2 size={15} className="animate-spin" /> : null}
                      {plan.cta}
                      {!isBusy && <ChevronRight size={14} />}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── ДЖАРВИС / ВАЛЛИ Premium (addon-подписки) ── */}
        <section className="mb-16">
          <h2 className="text-[24px] font-bold mb-2 text-center">ДЖАРВИС и ВАЛЛИ Premium</h2>
          <p className="text-[14px] text-center mb-8 max-w-xl mx-auto leading-relaxed" style={{ color: LABEL }}>
            Отдельные подписки на прокачку конкретного AI-советника — $99/мес каждая, независимо от основного тарифа.
            Уровень и elite-статус зарабатываются активностью, а не покупаются.
          </p>

          {addonNotice && (
            <div
              className="mb-6 mx-auto max-w-lg rounded-xl px-5 py-3 text-[14px] text-center"
              style={{
                background: addonNotice.ok ? "rgba(52,211,153,0.08)" : "rgba(239,68,68,0.08)",
                border: `1px solid ${addonNotice.ok ? "rgba(52,211,153,0.25)" : "rgba(239,68,68,0.25)"}`,
                color: addonNotice.ok ? "#34D399" : "#F87171",
              }}
            >
              {addonNotice.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            {ADDON_DEFS.map((def) => {
              const status = addonStatus?.[def.key]
              const isActiveAddon = status?.status === "active" || status?.status === "trialing"
              const isBusy = addonBusy === def.key
              const progress = status?.progress
              const xpInLevel = progress ? progress.xp % ADDON_XP_PER_LEVEL : 0
              const isElite = progress?.tier === "elite"

              return (
                <div
                  key={def.key}
                  className="relative flex flex-col rounded-2xl overflow-hidden"
                  style={{
                    background: CARD,
                    border: isActiveAddon ? `1px solid ${def.color}` : `1px solid ${BORDER}`,
                    boxShadow: isActiveAddon ? `0 0 30px ${def.glow}, 0 0 0 1px ${def.color}30` : "none",
                  }}
                >
                  <div className="p-6 flex flex-col flex-1">
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: `${def.color}18`, border: `1px solid ${def.color}30` }}
                        >
                          <def.Icon size={18} style={{ color: def.color }} />
                        </div>
                        <div>
                          <p className="text-[17px] font-semibold leading-tight">{def.name}</p>
                          <p className="text-[12px] mt-0.5" style={{ color: LABEL }}>{def.subtitle}</p>
                        </div>
                      </div>
                      {isElite && (
                        <div
                          className="px-2.5 py-1 rounded-full text-[10px] font-semibold tracking-wide shrink-0"
                          style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", color: "#F59E0B" }}
                        >
                          Elite
                        </div>
                      )}
                    </div>

                    <div className="mb-5">
                      <span className="text-[32px] font-bold leading-none" style={{ color: def.color }}>$99</span>
                      <span className="text-[13px] ml-1" style={{ color: LABEL }}>/мес</span>
                    </div>

                    {isActiveAddon && progress ? (
                      <div
                        className="mb-5 rounded-xl p-3"
                        style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}
                      >
                        <div className="flex items-center justify-between mb-2 text-[12px]">
                          <span style={{ color: LABEL }}>Уровень {progress.level}</span>
                          <span style={{ color: def.color }}>{xpInLevel}/{ADDON_XP_PER_LEVEL} XP</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${xpInLevel}%`, background: def.color }}
                          />
                        </div>
                        {status?.cancelAtPeriodEnd && (
                          <p className="text-[11px] mt-2" style={{ color: "#F87171" }}>
                            Отменена — доступ сохранится до конца оплаченного периода
                          </p>
                        )}
                      </div>
                    ) : (
                      <ul className="flex-1 space-y-2 mb-6">
                        {def.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-[13px]">
                            <Check size={13} className="mt-0.5 shrink-0" style={{ color: "#34D399" }} />
                            <span style={{ color: "rgba(255,255,255,0.65)" }}>{f}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {isActiveAddon ? (
                      <div className="flex gap-2 mt-auto">
                        <button
                          type="button"
                          onClick={() => togglePanel(def.product)}
                          className="flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-all duration-200 hover:opacity-90"
                          style={{ background: `${def.color}15`, border: `1px solid ${def.color}30`, color: def.color }}
                        >
                          <Palette size={14} />
                          Управлять
                          <ChevronDown
                            size={14}
                            style={{ transform: openPanel === def.product ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
                          />
                        </button>
                        {!status?.cancelAtPeriodEnd && (
                          <button
                            type="button"
                            onClick={() => handleAddonCancel(def.key)}
                            disabled={isBusy}
                            className="rounded-xl px-4 py-3 text-[13px] font-medium transition-all duration-200 hover:opacity-90 disabled:opacity-50"
                            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#F87171" }}
                          >
                            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddonSubscribe(def.key)}
                        disabled={addonBusy !== null}
                        className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-[14px] font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed mt-auto"
                        style={{ background: `linear-gradient(135deg, ${def.color}, ${def.color}cc)`, color: "#000" }}
                      >
                        {isBusy ? <Loader2 size={15} className="animate-spin" /> : null}
                        Подключить Premium
                        {!isBusy && <ChevronRight size={14} />}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Панель кастомизации + курсов открытого продукта ── */}
          {openPanel && (() => {
            const def = ADDON_DEFS.find((d) => d.product === openPanel)!
            const cust = customization[openPanel]
            const productUnlocks = unlocks[openPanel] || []
            const productCourses = courses[openPanel] || []
            const themeUnlocks = productUnlocks.filter((u) => u.option_type === "theme")
            const voiceUnlocks = productUnlocks.filter((u) => u.option_type === "voice")

            return (
              <div
                className="rounded-2xl p-6"
                style={{ background: CARD, border: `1px solid ${def.color}40` }}
              >
                {panelLoading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 size={20} className="animate-spin" style={{ color: def.color }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Кастомизация */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <Palette size={16} style={{ color: def.color }} />
                        <h3 className="text-[15px] font-semibold">Кастомизация — {def.name}</h3>
                      </div>

                      <label className="block text-[12px] mb-1.5" style={{ color: LABEL }}>Имя ассистента</label>
                      <div className="flex gap-2 mb-4">
                        <input
                          type="text"
                          maxLength={40}
                          value={customNameInput}
                          onChange={(e) => setCustomNameInput(e.target.value)}
                          placeholder={def.name}
                          className="flex-1 rounded-lg px-3 py-2 text-[13px] outline-none"
                          style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, color: "#FFFFFF" }}
                        />
                        <button
                          type="button"
                          onClick={() => saveCustomName(openPanel)}
                          disabled={savingCustomName}
                          className="rounded-lg px-3 py-2 text-[13px] font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
                          style={{ background: `${def.color}20`, border: `1px solid ${def.color}40`, color: def.color }}
                        >
                          {savingCustomName ? <Loader2 size={13} className="animate-spin" /> : "Сохранить"}
                        </button>
                      </div>

                      <p className="text-[12px] mb-1.5" style={{ color: LABEL }}>Тема оформления</p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {themeUnlocks.length === 0 && (
                          <p className="text-[12px]" style={{ color: LABEL }}>Разблокируйте темы прогрессом</p>
                        )}
                        {themeUnlocks.map((u) => (
                          <button
                            key={u.option_key}
                            type="button"
                            onClick={() => applyUnlockedOption(openPanel, "theme", u.option_key)}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90"
                            style={
                              cust?.themeKey === u.option_key
                                ? { background: `${def.color}25`, border: `1px solid ${def.color}`, color: def.color }
                                : { background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.65)" }
                            }
                          >
                            {u.option_key}
                          </button>
                        ))}
                      </div>

                      <p className="text-[12px] mb-1.5" style={{ color: LABEL }}>Голос</p>
                      <div className="flex flex-wrap gap-2">
                        {voiceUnlocks.length === 0 && (
                          <p className="text-[12px]" style={{ color: LABEL }}>Разблокируйте голоса прогрессом</p>
                        )}
                        {voiceUnlocks.map((u) => (
                          <button
                            key={u.option_key}
                            type="button"
                            onClick={() => applyUnlockedOption(openPanel, "voice", u.option_key)}
                            className="rounded-lg px-3 py-1.5 text-[12px] font-medium transition-opacity hover:opacity-90"
                            style={
                              cust?.voiceKey === u.option_key
                                ? { background: `${def.color}25`, border: `1px solid ${def.color}`, color: def.color }
                                : { background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}`, color: "rgba(255,255,255,0.65)" }
                            }
                          >
                            {u.option_key}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Обучение */}
                    <div>
                      <div className="flex items-center gap-2 mb-4">
                        <GraduationCap size={16} style={{ color: def.color }} />
                        <h3 className="text-[15px] font-semibold">Обучение — {def.name}</h3>
                      </div>

                      <div className="space-y-2.5">
                        {productCourses.length === 0 && (
                          <p className="text-[13px]" style={{ color: LABEL }}>Курсы скоро появятся</p>
                        )}
                        {productCourses.map((c) => (
                          <div
                            key={c.courseKey}
                            className="rounded-xl p-3"
                            style={{ background: "rgba(255,255,255,0.02)", border: `1px solid ${BORDER}` }}
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <p className="text-[13px] font-medium flex items-center gap-1.5">
                                {c.locked && <Lock size={11} style={{ color: LABEL }} />}
                                {c.title}
                              </p>
                              <span className="text-[11px] shrink-0" style={{ color: def.color }}>+{c.xpReward} XP</span>
                            </div>
                            {c.description && (
                              <p className="text-[12px] mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>{c.description}</p>
                            )}
                            {c.locked ? (
                              <p className="text-[11px]" style={{ color: "#F59E0B" }}>Доступно с тиром Elite</p>
                            ) : c.status === "completed" ? (
                              <p className="text-[11px] flex items-center gap-1" style={{ color: "#34D399" }}>
                                <Check size={11} /> Пройден
                              </p>
                            ) : (
                              <button
                                type="button"
                                onClick={() => markCourseComplete(openPanel, c.courseKey)}
                                className="text-[11px] font-medium rounded-lg px-2.5 py-1 transition-opacity hover:opacity-90"
                                style={{ background: `${def.color}18`, border: `1px solid ${def.color}30`, color: def.color }}
                              >
                                Отметить пройденным
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </section>

        {/* ── AI-ассистенты ── */}
        <section className="mb-16">
          <h2 className="text-[24px] font-bold mb-2 text-center">AI-ассистенты на каждом тарифе</h2>
          <p className="text-[14px] text-center mb-8" style={{ color: LABEL }}>
            ДЖАРВИС, ВАЛЛИ и БЛИЗНЕЦ доступны всем зарегистрированным пользователям без лимитов.
            Оркестратор — для Pro и Supreme.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {AI_AGENTS.map((a) => (
              <div
                key={a.name}
                className="rounded-2xl p-5"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${a.color}18`, border: `1px solid ${a.color}30` }}
                >
                  <a.Icon size={18} style={{ color: a.color }} />
                </div>
                <p className="text-[15px] font-semibold mb-2" style={{ color: a.color }}>{a.name}</p>
                <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Сравнение оркестратора ── */}
        <section
          className="rounded-2xl p-8 mb-16"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}
            >
              <GitBranch size={18} style={{ color: "#F59E0B" }} />
            </div>
            <div>
              <h3 className="text-[18px] font-bold">AI-Оркестратор</h3>
              <p className="text-[13px]" style={{ color: LABEL }}>Цепочки нейросетей — Pro и Supreme</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { plan: "Master ($49/мес)", color: "#06B6D4", items: ["10 запусков/день", "2 OS 5.0 в цепочке", "4 OS 3.3 в цепочке", "4 OS 3.0 в цепочке", "До 20 узлов в цепочке"] },
              { plan: "Supreme ($99/мес)", color: "#F59E0B", items: ["10 запусков/день", "4 OS 5.0 в цепочке", "6 OS 3.3 в цепочке", "4 OS 3.0 в цепочке", "Безлимит узлов (20 max)", "Ранний доступ"] },
              { plan: "Что это даёт?", color: "#A855F7", items: ["Автоматизация задач", "Последовательная обработка текста", "Мульти-провайдерная генерация", "Сохранение как шаблоны ДЖАРВИСА", "SSE-поток прогресса в реальном времени"] },
            ].map(({ plan, color, items }) => (
              <div key={plan}>
                <p className="text-[13px] font-semibold mb-3" style={{ color }}>{plan}</p>
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-[13px]" style={{ color: "rgba(255,255,255,0.65)" }}>
                      <Check size={12} style={{ color }} className="shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ── */}
        <section className="max-w-2xl mx-auto mb-16">
          <h2 className="text-[24px] font-bold mb-8 text-center">Частые вопросы</h2>
          <div className="space-y-4">
            {[
              {
                q: "Что такое AI-лимиты?",
                a: "Каждый день лимиты обнуляются в полночь UTC. Лимит — количество обращений к конкретной нейросети OSGARD (OS 5.0, OS 3.3, OS 3.0) при генерации проектов, артефактов и чате.",
              },
              {
                q: "Входит ли ДЖАРВИС, ВАЛЛИ, БЛИЗНЕЦ в бесплатный план?",
                a: "Да — все три ассистента доступны всем зарегистрированным пользователям без лимитов. Оркестратор (цепочки нейросетей) — только для Pro/Supreme.",
              },
              {
                q: "Можно ли отменить подписку?",
                a: "Да, в любой момент. Подписка остаётся активной до конца оплаченного периода. После отмены тариф автоматически вернётся на бесплатный.",
              },
              {
                q: "Что происходит с лимитами при апгрейде?",
                a: "При переходе на более высокий тариф новые лимиты применяются немедленно. Уже использованные запросы текущего дня засчитываются в новые лимиты.",
              },
            ].map(({ q, a }) => (
              <div
                key={q}
                className="rounded-xl p-5"
                style={{ background: CARD, border: `1px solid ${BORDER}` }}
              >
                <p className="text-[14px] font-semibold mb-2">{q}</p>
                <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>{a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── CTA снизу ── */}
        {!user && (
          <div className="text-center">
            <p className="text-[15px] mb-5" style={{ color: LABEL }}>
              Начни бесплатно — регистрация занимает 30 секунд
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-[15px] font-bold text-white transition-all duration-200 hover:opacity-90 hover:-translate-y-0.5"
              style={{ background: "linear-gradient(135deg, #06B6D4, #7C3AED)", boxShadow: "0 0 40px rgba(6,182,212,0.25)" }}
            >
              <Sparkles size={18} />
              Создать аккаунт бесплатно
            </Link>
          </div>
        )}
      </main>
    </div>
  )
}
