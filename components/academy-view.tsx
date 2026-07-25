"use client"

/* ================================================================
   OSGARD · Academy — «Founders Program» (супер-премиальный лендинг)
   ----------------------------------------------------------------
   Монетизируемый образовательный продукт: курс от создателей платформы
   по созданию стартапов + экосистемная сертификация «OSGARD Certified
   Vibecoder» + (на верхнем тире) слот встречи с создателями.

   Визуальная подпись раздела — НАМЕРЕННО иная, чем у остальной платформы
   (по прямому требованию пользователя): фон «мегамозга» (нейросеть из
   синапсов) и собственный язык CTA-кнопок (расплавленное золото + свип +
   ∞-жест), а не платформенные cyan-кнопки. Все стили заскоуплены префиксом
   `acd-` и инжектятся локальным <style> — ноль влияния на globals.

   Prod-safe: фичефлаг ACADEMY_ENABLED (бэк). Пока выключен — витрина
   показывает состояние «Скоро открываем набор», checkout не вызывается.
   Гость → CTA ведёт на регистрацию (checkout требует авторизации).
   ================================================================ */

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  BrainCircuit,
  GraduationCap,
  ShieldCheck,
  Users,
  Infinity as InfinityIcon,
  Check,
  Loader2,
  Sparkles,
  Crown,
  Rocket,
} from "lucide-react"
import { Navbar } from "./navbar"
import { CertificationProgress } from "./certification-progress"
import { CertifiedCredential } from "./certified-credential"
import { apiClient } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-store"

/* ─── Типы ответа бэка (см. backend/src/routes/academy.routes.ts) ─── */
type AcademyTier = "founder_track" | "founder_circle"
type AcademyConfig = {
  enabled: boolean
  tiers: Array<{ tier: AcademyTier; priceUsd: number; level: number }>
}
type AcademyStatus = {
  enabled: boolean
  enrollment: {
    tier: AcademyTier | null
    status: string
    currentPeriodEnd: number | null
    cancelAtPeriodEnd: boolean
  }
  tierLevel: number
}

/* ─── Продуктовая витрина тиров (маркетинг-копирайт — в компоненте,
       как в родственной pricing-view.tsx; цены сверяются с бэком) ─── */
type TierCard = {
  tier: AcademyTier
  name: string
  tagline: string
  priceUsd: number
  period: string
  Icon: typeof Rocket
  flagship?: boolean
  features: string[]
}

const TIERS: TierCard[] = [
  {
    tier: "founder_track",
    name: "Founder Track",
    tagline: "Путь основателя",
    priceUsd: 99,
    period: "в месяц",
    Icon: Rocket,
    features: [
      "Курс от создателей: от идеи к работающему стартапу",
      "Вайбкодинг MVP на платформе — без команды разработчиков",
      "Когорта основателей и разбор ваших запусков",
      "Право на «экзамен делом» и сертификацию Vibecoder",
    ],
  },
  {
    tier: "founder_circle",
    name: "Founder Circle",
    tagline: "Круг создателей",
    priceUsd: 990,
    period: "в месяц",
    Icon: Crown,
    flagship: true,
    features: [
      "Всё из Founder Track",
      "1 личная встреча с создателями платформы каждый месяц",
      "Приоритетный разбор и прямая линия с командой",
      "Печать «Circle» на вашем credential Vibecoder",
      "Ранний доступ к плейбукам масштабирования",
    ],
  },
]

/* Смысловые опоры продукта (честная рамка «команды мечты») */
const PILLARS = [
  {
    Icon: BrainCircuit,
    title: "Экзамен — делом, не тестом",
    text: "Право на сертификат вычисляется из реальных достижений на платформе: задеплоенные проекты, качество ковки, тир Архитектора. Нельзя зазубрить — можно только отгрузить.",
  },
  {
    Icon: ShieldCheck,
    title: "Проверяемый credential",
    text: "«OSGARD Certified Vibecoder» — экосистемная сертификация (как AWS Certified): публично проверяемая, с серийным номером и статусом. Это не гос-лицензия, а защищённый бренд-знак мастерства.",
  },
  {
    Icon: Users,
    title: "Встреча с создателями",
    text: "На тире Circle — личный слот с командой, создавшей платформу. Живой разбор именно вашего стартапа, а не запись вебинара.",
  },
]

export function AcademyView() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [config, setConfig] = useState<AcademyConfig | null>(null)
  const [status, setStatus] = useState<AcademyStatus | null>(null)
  const [loadingTier, setLoadingTier] = useState<AcademyTier | null>(null)
  /* Возврат со Stripe Checkout (?checkout=success|cancel) — сид из URL один раз,
     ленивым инициализатором, чтобы не дёргать setState в эффекте (каскад ре-рендеров). */
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(() => {
    const c = searchParams.get("checkout")
    if (c === "success") return { kind: "ok", text: "Оплата прошла — добро пожаловать в программу." }
    if (c === "cancel") return { kind: "err", text: "Оплата отменена. Вы можете вернуться в любой момент." }
    return null
  })

  useEffect(() => {
    apiClient
      .get<AcademyConfig>("/academy/config")
      .then(setConfig)
      .catch(() => setConfig({ enabled: false, tiers: [] }))
  }, [])

  useEffect(() => {
    if (!user) return
    apiClient
      .get<AcademyStatus>("/academy/status")
      .then(setStatus)
      .catch(() => {})
  }, [user])

  const enabled = config?.enabled ?? false
  const currentTier = status?.enrollment?.tier ?? null
  const isActive = status?.enrollment?.status === "active" || status?.enrollment?.status === "trialing"

  async function handleEnroll(tier: AcademyTier) {
    setNotice(null)
    if (!user) {
      router.push("/register?next=/academy")
      return
    }
    if (!enabled) {
      setNotice({ kind: "err", text: "Набор пока закрыт — скоро открываем." })
      return
    }
    setLoadingTier(tier)
    try {
      const res = await apiClient.post<{ mock?: boolean; url?: string | null; message?: string }>(
        "/academy/checkout",
        { tier },
      )
      if (res?.url) {
        window.location.assign(res.url)
        return
      }
      // mock-режим (dev, Stripe не настроен) — подписка активирована локально
      const fresh = await apiClient.get<AcademyStatus>("/academy/status").catch(() => null)
      if (fresh) setStatus(fresh)
      setNotice({ kind: "ok", text: res?.message || "Запись в программу активирована." })
    } catch (e: any) {
      const msg = e?.data?.error || e?.message || "Не удалось оформить запись. Попробуйте позже."
      setNotice({ kind: "err", text: msg })
    } finally {
      setLoadingTier(null)
    }
  }

  return (
    <div className="acd-root">
      <Navbar />

      {/* ── Фон «мегамозга»: нейросеть синапсов ── */}
      <MegaBrainBackdrop />

      <main className="acd-main">
        {/* HERO */}
        <header className="acd-hero">
          <span className="acd-eyebrow">
            <InfinityIcon size={14} strokeWidth={2.5} />
            OSGARD · FOUNDERS PROGRAM
          </span>
          <h1 className="acd-title">
            Академия <span className="acd-title-accent">основателей</span>
          </h1>
          <p className="acd-lede">
            Программа от создателей платформы: как из идеи собрать работающий стартап,
            выковать своё приложение с ИИ и получить проверяемый знак мастерства —
            <span className="acd-lede-strong"> OSGARD Certified Vibecoder</span>.
          </p>

          {!enabled && (
            <div className="acd-soon">
              <Sparkles size={16} />
              Скоро открываем набор — оставайтесь рядом.
            </div>
          )}

          {isActive && currentTier && (
            <div className="acd-enrolled">
              <Check size={16} strokeWidth={3} />
              Вы в программе · {currentTier === "founder_circle" ? "Founder Circle" : "Founder Track"}
            </div>
          )}

          {isActive && currentTier === "founder_circle" && (
            <div className="acd-circle-entry">
              <Link href="/calendar" className="acd-circle-link">
                <Users size={16} strokeWidth={2} />
                Записаться на встречу с создателями
              </Link>
            </div>
          )}

          {notice && (
            <div className={`acd-notice acd-notice--${notice.kind}`}>{notice.text}</div>
          )}
        </header>

        {/* ОПОРЫ */}
        <section className="acd-pillars">
          {PILLARS.map((p) => (
            <div key={p.title} className="acd-pillar">
              <div className="acd-pillar-ico">
                <p.Icon size={22} strokeWidth={1.6} />
              </div>
              <h3 className="acd-pillar-title">{p.title}</h3>
              <p className="acd-pillar-text">{p.text}</p>
            </div>
          ))}
        </section>

        {/* ПРОГРЕСС К СЕРТИФИКАЦИИ («Экзамен делом») — только для авторизованных */}
        <CertificationProgress />

        {/* CREDENTIAL: карта владельца или вход «Получить credential» при готовности */}
        <CertifiedCredential />

        {/* ТИРЫ */}
        <section className="acd-tiers">
          {TIERS.map((tc) => {
            const busy = loadingTier === tc.tier
            const owned = isActive && currentTier === tc.tier
            return (
              <div key={tc.tier} className={`acd-card${tc.flagship ? " acd-card--flagship" : ""}`}>
                {tc.flagship && (
                  <span className="acd-card-ribbon">
                    <Crown size={12} strokeWidth={2.5} /> Флагман
                  </span>
                )}
                <div className="acd-card-head">
                  <div className="acd-card-ico">
                    <tc.Icon size={24} strokeWidth={1.6} />
                  </div>
                  <div>
                    <div className="acd-card-name">{tc.name}</div>
                    <div className="acd-card-tag">{tc.tagline}</div>
                  </div>
                </div>

                <div className="acd-price">
                  <span className="acd-price-cur">$</span>
                  <span className="acd-price-num">{tc.priceUsd}</span>
                  <span className="acd-price-per">/ {tc.period}</span>
                </div>

                <ul className="acd-feats">
                  {tc.features.map((f) => (
                    <li key={f} className="acd-feat">
                      <Check size={15} strokeWidth={2.5} className="acd-feat-check" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`acd-cta${tc.flagship ? " acd-cta--gold" : " acd-cta--ghost"}`}
                  onClick={() => handleEnroll(tc.tier)}
                  disabled={busy || owned}
                >
                  <span className="acd-cta-label">
                    {busy ? (
                      <Loader2 size={16} className="acd-spin" />
                    ) : owned ? (
                      <>
                        <Check size={16} strokeWidth={3} /> Вы участник
                      </>
                    ) : !user ? (
                      <>
                        <GraduationCap size={16} /> Начать путь
                      </>
                    ) : !enabled ? (
                      "Скоро"
                    ) : (
                      <>
                        <GraduationCap size={16} /> Вступить
                      </>
                    )}
                  </span>
                  <InfinityIcon className="acd-cta-inf" size={18} strokeWidth={2} />
                </button>
              </div>
            )
          })}
        </section>

        {/* Честная сноска про природу сертификата */}
        <p className="acd-fineprint">
          «OSGARD Certified Vibecoder» — экосистемная сертификация платформы, а не государственная лицензия.
          Знак подтверждает мастерство внутри экосистемы, публично проверяем и может быть отозван при нарушении правил.
        </p>
      </main>

      <style>{ACADEMY_CSS}</style>
    </div>
  )
}

/* ================================================================
   MegaBrainBackdrop — амбиентная нейросеть «мегамозга».
   Узлы + синапсы в двух зеркальных полушариях. Медленный «поток»
   по синапсам (stroke-dashoffset) и мягкая пульсация узлов.
   Полностью декоративен (pointer-events:none), замирает при
   prefers-reduced-motion. Координаты фиксированы (SSR-стабильно).
   ================================================================ */
function MegaBrainBackdrop() {
  // Узлы одного полушария (viewBox 1000×620), второе — зеркалим по X.
  const half = [
    [300, 140], [360, 210], [270, 260], [340, 320], [250, 380],
    [330, 430], [400, 300], [420, 200], [380, 400], [300, 480],
    [220, 300], [450, 360], [410, 470],
  ]
  const nodes = [
    ...half.map(([x, y], i) => ({ x, y, i })),
    ...half.map(([x, y], i) => ({ x: 1000 - x, y, i: i + 100 })),
  ]
  // Синапсы внутри полушария (индексы в half).
  const edgesHalf: Array<[number, number]> = [
    [0, 1], [0, 2], [1, 6], [2, 3], [3, 4], [3, 5], [6, 7], [6, 3],
    [4, 8], [5, 8], [8, 9], [2, 10], [10, 4], [6, 11], [11, 12], [8, 12],
    [1, 7], [5, 12], [0, 7],
  ]
  const line = (a: number[], b: number[]) =>
    `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2 + 14},${(a[1] + b[1]) / 2 - 18} ${b[0]},${b[1]}`

  const synapses: string[] = []
  for (const [a, b] of edgesHalf) {
    synapses.push(line(half[a], half[b]))
    synapses.push(line([1000 - half[a][0], half[a][1]], [1000 - half[b][0], half[b][1]]))
  }
  // Мост между полушариями (мозолистое тело)
  synapses.push(line(half[6], [1000 - half[6][0], half[6][1]]))
  synapses.push(line(half[3], [1000 - half[3][0], half[3][1]]))

  return (
    <div className="acd-brain" aria-hidden="true">
      <svg viewBox="0 0 1000 620" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="acdNodeGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F4D77E" />
            <stop offset="100%" stopColor="#D4AF37" />
          </radialGradient>
          <linearGradient id="acdSynGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(212,175,55,0)" />
            <stop offset="50%" stopColor="rgba(212,175,55,0.55)" />
            <stop offset="100%" stopColor="rgba(212,175,55,0)" />
          </linearGradient>
        </defs>
        <g className="acd-syn-group">
          {synapses.map((d, i) => (
            <path
              key={i}
              d={d}
              className="acd-syn"
              style={{ animationDelay: `${(i % 10) * 0.6}s` }}
            />
          ))}
        </g>
        <g className="acd-node-group">
          {nodes.map((n) => (
            <circle
              key={n.i}
              cx={n.x}
              cy={n.y}
              r={n.i % 3 === 0 ? 4.5 : 3}
              className="acd-node"
              style={{ animationDelay: `${(n.i % 7) * 0.5}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  )
}

/* ================================================================
   Заскоупленные стили. Префикс `acd-` → не пересекается с globals.
   Собственный язык кнопок (расплавленное золото + свип + ∞) —
   намеренно ИНОЙ, чем платформенные cyan-кнопки.
   ================================================================ */
const ACADEMY_CSS = `
.acd-root {
  position: relative;
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 50% -10%, rgba(212,175,55,0.10), transparent 60%),
    radial-gradient(900px 500px at 50% 110%, rgba(212,175,55,0.06), transparent 60%),
    #070B18;
  color: #EFE9DA;
  overflow: hidden;
}
.acd-main {
  position: relative;
  z-index: 2;
  max-width: 1120px;
  margin: 0 auto;
  padding: 72px 24px 120px;
}

/* ── Фон мегамозга ── */
.acd-brain {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  opacity: 0.55;
  mask-image: radial-gradient(70% 60% at 50% 32%, #000 40%, transparent 78%);
  -webkit-mask-image: radial-gradient(70% 60% at 50% 32%, #000 40%, transparent 78%);
}
.acd-brain svg { width: 100%; height: 100%; display: block; }
.acd-syn {
  fill: none;
  stroke: url(#acdSynGrad);
  stroke-width: 1.4;
  stroke-dasharray: 6 10;
  animation: acd-flow 5.5s linear infinite;
}
@keyframes acd-flow { to { stroke-dashoffset: -160; } }
.acd-node {
  fill: url(#acdNodeGrad);
  filter: drop-shadow(0 0 6px rgba(212,175,55,0.6));
  animation: acd-pulse 4.2s ease-in-out infinite;
}
@keyframes acd-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.35); }
}
.acd-node-group circle { transform-box: fill-box; transform-origin: center; }

/* ── Hero ── */
.acd-hero { text-align: center; max-width: 780px; margin: 0 auto 64px; }
.acd-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 700; letter-spacing: 3px;
  color: #D4AF37; text-transform: uppercase;
  padding: 7px 16px; border-radius: 999px;
  border: 1px solid rgba(212,175,55,0.35);
  background: rgba(212,175,55,0.06);
}
.acd-title {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: clamp(44px, 7vw, 76px);
  line-height: 1.02; font-weight: 600;
  margin: 22px 0 0; letter-spacing: 0.5px;
  color: #F6F1E4;
}
.acd-title-accent {
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #B8860B);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  font-style: italic;
}
.acd-lede {
  margin: 22px auto 0; max-width: 640px;
  font-size: 18px; line-height: 1.6; color: #C7C0AE;
}
.acd-lede-strong { color: #EAD79A; font-weight: 600; }
.acd-soon, .acd-enrolled, .acd-notice {
  display: inline-flex; align-items: center; gap: 8px;
  margin-top: 24px; padding: 10px 18px; border-radius: 999px;
  font-size: 14px; font-weight: 600;
}
.acd-soon { color: #EAD79A; background: rgba(212,175,55,0.08); border: 1px solid rgba(212,175,55,0.3); }
.acd-enrolled { color: #7CF0B0; background: rgba(46,204,113,0.10); border: 1px solid rgba(46,204,113,0.35); }
.acd-notice { display: block; max-width: 520px; margin: 24px auto 0; text-align: center; }
.acd-notice--ok { color: #7CF0B0; background: rgba(46,204,113,0.08); border: 1px solid rgba(46,204,113,0.3); }
.acd-notice--err { color: #F0A7A7; background: rgba(231,76,60,0.08); border: 1px solid rgba(231,76,60,0.32); }

/* ── Опоры ── */
.acd-pillars {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px;
  margin-bottom: 72px;
}
.acd-pillar {
  padding: 30px 26px; border-radius: 18px;
  background: rgba(18,24,42,0.72);
  border: 1px solid rgba(212,175,55,0.16);
  backdrop-filter: blur(8px);
}
.acd-pillar-ico {
  width: 48px; height: 48px; border-radius: 13px;
  display: grid; place-items: center; margin-bottom: 16px;
  color: #D4AF37; background: rgba(212,175,55,0.10);
  border: 1px solid rgba(212,175,55,0.28);
}
.acd-pillar-title { font-size: 17px; font-weight: 700; margin: 0 0 8px; color: #F0EAD9; }
.acd-pillar-text { font-size: 14px; line-height: 1.6; color: #ABA491; margin: 0; }

/* ── Тир-карты ── */
.acd-tiers {
  display: grid; grid-template-columns: repeat(2, 1fr); gap: 26px;
  max-width: 880px; margin: 0 auto;
}
.acd-card {
  position: relative; padding: 34px 30px; border-radius: 22px;
  background: linear-gradient(180deg, rgba(20,26,46,0.9), rgba(12,16,30,0.9));
  border: 1px solid rgba(212,175,55,0.2);
  box-shadow: 0 18px 50px rgba(7,11,24,0.55);
  display: flex; flex-direction: column;
}
.acd-card--flagship {
  border-color: rgba(212,175,55,0.55);
  box-shadow: 0 22px 64px rgba(7,11,24,0.6), 0 0 40px rgba(212,175,55,0.14);
  background: linear-gradient(180deg, rgba(30,24,10,0.9), rgba(14,12,8,0.92));
}
.acd-card-ribbon {
  position: absolute; top: 18px; right: 18px;
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;
  color: #1A1405; padding: 5px 11px; border-radius: 999px;
  background: linear-gradient(100deg, #F4D77E, #D4AF37);
}
.acd-card-head { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
.acd-card-ico {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
  display: grid; place-items: center; color: #D4AF37;
  background: rgba(212,175,55,0.10); border: 1px solid rgba(212,175,55,0.3);
}
.acd-card-name { font-size: 21px; font-weight: 800; color: #F4EEDC; }
.acd-card-tag { font-size: 13px; color: #9C9585; margin-top: 2px; }
.acd-price { display: flex; align-items: baseline; gap: 3px; margin-bottom: 24px; }
.acd-price-cur { font-size: 22px; font-weight: 700; color: #D4AF37; }
.acd-price-num {
  font-family: var(--font-cormorant, 'Cormorant Garamond', Georgia, serif);
  font-size: 56px; font-weight: 700; line-height: 1; color: #F6F1E4;
}
.acd-price-per { font-size: 14px; color: #9C9585; margin-left: 4px; }
.acd-feats { list-style: none; padding: 0; margin: 0 0 28px; display: grid; gap: 13px; }
.acd-feat { display: flex; gap: 11px; font-size: 14.5px; line-height: 1.45; color: #CFC8B6; }
.acd-feat-check { color: #D4AF37; flex-shrink: 0; margin-top: 2px; }

/* ── Собственный язык CTA (не как остальная платформа) ── */
.acd-cta {
  position: relative; overflow: hidden;
  margin-top: auto;
  display: inline-flex; align-items: center; justify-content: center;
  height: 54px; border-radius: 14px; cursor: pointer;
  font-size: 15px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase;
  border: 1px solid transparent;
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease, filter .25s ease;
}
.acd-cta:disabled { cursor: default; opacity: 0.7; }
.acd-cta-label { position: relative; z-index: 2; display: inline-flex; align-items: center; gap: 8px; }
.acd-cta-inf {
  position: absolute; z-index: 1; right: 18px; opacity: 0; color: currentColor;
  transform: translateX(8px) scale(0.6);
  transition: opacity .3s ease, transform .3s cubic-bezier(0.16,1,0.3,1);
}
.acd-cta::after {
  content: ""; position: absolute; inset: 0; z-index: 0;
  background: linear-gradient(100deg, transparent 20%, rgba(255,255,255,0.35) 50%, transparent 80%);
  transform: translateX(-120%);
  transition: transform .6s cubic-bezier(0.16,1,0.3,1);
}
.acd-cta:hover:not(:disabled) { transform: scale(1.03); }
.acd-cta:hover:not(:disabled)::after { transform: translateX(120%); }
.acd-cta:hover:not(:disabled) .acd-cta-inf { opacity: 0.85; transform: translateX(0) scale(1); }

.acd-cta--gold {
  color: #1A1405;
  background: linear-gradient(100deg, #F4D77E, #D4AF37 55%, #C79A24);
  box-shadow: 0 10px 30px rgba(212,175,55,0.28), inset 0 1px 0 rgba(255,255,255,0.4);
}
.acd-cta--gold:hover:not(:disabled) { box-shadow: 0 14px 40px rgba(212,175,55,0.42), inset 0 1px 0 rgba(255,255,255,0.5); }
.acd-cta--ghost {
  color: #EAD79A;
  background: rgba(212,175,55,0.06);
  border-color: rgba(212,175,55,0.45);
}
.acd-cta--ghost:hover:not(:disabled) { background: rgba(212,175,55,0.12); box-shadow: 0 10px 30px rgba(212,175,55,0.16); }

.acd-spin { animation: acd-rot 0.9s linear infinite; }
@keyframes acd-rot { to { transform: rotate(360deg); } }

.acd-fineprint {
  max-width: 720px; margin: 56px auto 0; text-align: center;
  font-size: 12.5px; line-height: 1.6; color: #7E7869;
}

/* ── Адаптив ── */
@media (max-width: 860px) {
  .acd-pillars { grid-template-columns: 1fr; }
  .acd-tiers { grid-template-columns: 1fr; }
}

/* ── Вход на встречу с создателями (только активный Circle) ── */
.acd-circle-entry { margin-top: 20px; }
.acd-circle-link {
  display: inline-flex; align-items: center; gap: 9px;
  padding: 11px 22px; border-radius: 999px; text-decoration: none;
  font-size: 14px; font-weight: 700; letter-spacing: 0.4px;
  color: #1A1405; background: linear-gradient(100deg, #F4D77E, #D4AF37 60%, #C79A24);
  box-shadow: 0 10px 28px rgba(212,175,55,0.26), inset 0 1px 0 rgba(255,255,255,0.4);
  transition: transform .25s cubic-bezier(0.16,1,0.3,1), box-shadow .25s ease;
}
.acd-circle-link:hover { transform: scale(1.03); box-shadow: 0 14px 38px rgba(212,175,55,0.4), inset 0 1px 0 rgba(255,255,255,0.5); }

/* ── Доступность: замораживаем амбиентные анимации ── */
@media (prefers-reduced-motion: reduce) {
  .acd-syn, .acd-node, .acd-cta, .acd-cta::after, .acd-cta-inf, .acd-circle-link { animation: none !important; transition: none !important; }
  .acd-node { opacity: 0.8; }
}
`
