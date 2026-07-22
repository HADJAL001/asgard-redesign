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
  Loader2,
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
      { text: "ДЖАРВИС — безлимит (DeepSeek)" },
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
      { text: "2 Claude + 4 Grok + 9 DeepSeek/день", highlight: true },
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
      { text: "Claude / Grok / DeepSeek — безлимит", highlight: true },
      { text: "Оркестратор — 10 цепочек/день",       highlight: true },
      { text: "ДЖАРВИС + ВАЛЛИ + БЛИЗНЕЦ — всё" },
      { text: "2 Claude + 4 Grok + 4 DeepSeek в оркестраторе" },
      { text: "Деплой + GitHub + Netlify" },
      { text: "Ранний доступ к новым фичам" },
    ],
    aiLimits: { claude: "∞", grok: "∞", deepseek: "∞", total: "∞" },
    cta:        "Подключить Supreme",
    stripePlan: "legend",
  },
]

/* ── AI-ассистенты ─────────────────────────────────────────────── */
const AI_AGENTS = [
  {
    name:  "ДЖАРВИС",
    Icon:  Bot,
    color: "#06B6D4",
    desc:  "Советник, чат, помощь с артефактами — безлимит на DeepSeek/Claude для всех зарегистрированных пользователей.",
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
    desc:  "Цепочки нейросетей (Claude → Grok → DeepSeek). Доступен на тарифах Master и Supreme.",
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
            От гостевого демо до полного безлимита — Claude, Grok и DeepSeek работают на тебя.
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
                        { label: "Claude",   value: plan.aiLimits.claude,   color: "#F59E0B" },
                        { label: "Grok",     value: plan.aiLimits.grok,     color: "#A855F7" },
                        { label: "DeepSeek", value: plan.aiLimits.deepseek, color: "#06B6D4" },
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
              { plan: "Master ($49/мес)", color: "#06B6D4", items: ["10 запусков/день", "2 Claude в цепочке", "4 Grok в цепочке", "4 DeepSeek в цепочке", "До 20 узлов в цепочке"] },
              { plan: "Supreme ($99/мес)", color: "#F59E0B", items: ["10 запусков/день", "4 Claude в цепочке", "6 Grok в цепочке", "4 DeepSeek в цепочке", "Безлимит узлов (20 max)", "Ранний доступ"] },
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
                a: "Каждый день лимиты обнуляются в полночь UTC. Лимит — количество обращений к конкретному AI-провайдеру (Claude, Grok, DeepSeek) при генерации проектов, артефактов и чате.",
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
