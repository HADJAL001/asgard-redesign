"use client"

import { useEffect, useRef, useState, type FormEvent, useCallback } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import {
  Infinity as InfinityIcon,
  ArrowRight,
  Crown,
  Gem,
  Shield,
  Award,
  Star,
  CheckCircle,
  Sparkles,
  X,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { Reveal } from "@/components/landing/Reveal"
import {
  IconIdea,
  IconCreate,
  IconLegend,
  IconMarket,
  IconDialogue,
  IconDashboard,
  IconCommunity,
  IconTrade,
  IconEarn,
  IconInvest,
} from "@/components/icons/premium"

const GlobeScene = dynamic(() => import("@/components/landing/GlobeScene"), {
  ssr: false,
})

// ─── Кастомный модальный компонент ─────────────────────────────────────
function ArtifactSuccessModal({
  artifactName,
  onClose,
}: {
  artifactName: string
  onClose: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const confetti: {
      x: number; y: number; vx: number; vy: number
      color: string; size: number; rotation: number; rotSpeed: number; opacity: number
    }[] = []

    const colors = ["#FFD700", "#FFA500", "#FF6B6B", "#7AACFF", "#A855F7", "#34D399", "#F472B6"]

    for (let i = 0; i < 120; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 200,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        opacity: 1,
      })
    }

    let rafId = 0
    let t = 0
    const animate = () => {
      t++
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let allDone = true
      for (const p of confetti) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.08
        p.rotation += p.rotSpeed
        if (t > 80) p.opacity -= 0.012
        if (p.opacity > 0) allDone = false
        ctx.save()
        ctx.globalAlpha = Math.max(0, p.opacity)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (!allDone) rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(rafId)
  }, [])

  // закрытие по Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  return (
    <div className="artifact-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Артефакт создан">
      <canvas ref={canvasRef} className="artifact-confetti-canvas" />
      <div className="artifact-modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="artifact-modal-close" onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
        <div className="artifact-modal-icon">
          <div className="artifact-modal-icon-ring" />
          <CheckCircle size={40} strokeWidth={1.5} />
        </div>
        <div className="artifact-modal-title">Запрос принят!</div>
        <div className="artifact-modal-subtitle">
          Твой артефакт
        </div>
        <div className="artifact-modal-name">
          <Sparkles size={14} strokeWidth={1.5} />
          &ldquo;{artifactName}&rdquo;
          <Sparkles size={14} strokeWidth={1.5} />
        </div>
        <div className="artifact-modal-desc">
          скоро появится в <span className="artifact-modal-highlight">Зале Славы</span>
        </div>
        <button className="artifact-modal-btn" onClick={onClose}>
          Отлично! <ArrowRight size={16} strokeWidth={2} />
        </button>
      </div>
    </div>
  )
}

export function EternityLanding() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [modalArtifact, setModalArtifact] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const closeModal = useCallback(() => setModalArtifact(null), [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const [particles, setParticles] = useState<
    { left: string; top: string; duration: string; delay: string }[]
  >([])
  useEffect(() => {
    Promise.resolve().then(() => {
      setParticles(
        Array.from({ length: 40 }).map(() => ({
          left: `${Math.random() * 100}vw`,
          top: `${Math.random() * 100}vh`,
          duration: `${Math.random() * 20 + 15}s`,
          delay: `${Math.random() * 10}s`,
        })),
      )
    })
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const el = inputRef.current
    if (!el) return
    const query = el.value.trim()
    if (!query) {
      el.style.borderColor = "#FF6B6B"
      el.style.boxShadow = "0 0 20px rgba(255, 107, 107, 0.3)"
      setTimeout(() => {
        el.style.borderColor = ""
        el.style.boxShadow = ""
      }, 1500)
      return
    }
    setIsSubmitting(true)
    setTimeout(() => {
      setModalArtifact(query)
      setIsSubmitting(false)
      el.value = ""
    }, 400)
  }

  return (
    <div className="eternity-page">
      {/* Глобус и частицы */}
      <div id="globe-bg">
        <GlobeScene />
        <div id="globe-vignette" aria-hidden="true" />
      </div>
      <div id="particles">
        {particles.map((p, i) => (
          <span
            key={i}
            className="particle"
            style={{
              left: p.left,
              top: p.top,
              animationDuration: p.duration,
              animationDelay: p.delay,
            }}
          />
        ))}
      </div>

      {/* Модальное окно успеха */}
      {modalArtifact && (
        <ArtifactSuccessModal artifactName={modalArtifact} onClose={closeModal} />
      )}

      {/* Прозрачная шапка */}
      <header className={`site-nav${scrolled ? " scrolled" : ""}`}>
        <Link href="/" className="site-nav-logo" aria-label="OSGARD — главная">
          OSG<InfinityIcon size={16} strokeWidth={2} className="site-nav-logo-glyph" aria-hidden="true" />RD
        </Link>
        <div className="site-nav-links">
          <Link href="/login" className="site-nav-link">Войти</Link>
          <Link href="/register" className="site-nav-link site-nav-link-primary">Регистрация</Link>
        </div>
      </header>

      {/* Основной контент */}
      <div className="container">
        <header className="hero-content">
          <h1>
            Преврати идею
            <br />в вечность
          </h1>
          <div className="tc-badge">
            <InfinityIcon size={14} strokeWidth={1.4} aria-hidden="true" />
            Цифровое золото нового поколения
            <span className="tc-badge-dot" aria-hidden="true" />
          </div>
          <p className="hero-subtitle">
            Создавай артефакты, продавай за <InfinityIcon className="ico gold" size={20} aria-hidden="true" /> TimeCoin,
            становись легендой
          </p>

          {/* Миниатюрное окно ввода (всегда видимо) */}
          <form className="artifact-form" onSubmit={handleSubmit}>
            <input ref={inputRef} type="text" placeholder="Опиши свой артефакт..." autoComplete="off" aria-label="Опиши свой артефакт" />
            <button type="submit" disabled={isSubmitting} className={isSubmitting ? "submitting" : ""}>
              {isSubmitting ? (
                <><span className="btn-spinner" /> Создаём...</>
              ) : (
                <>Создать проект <ArrowRight size={18} strokeWidth={2} aria-hidden="true" /></>
              )}
            </button>
          </form>
        </header>
        <div className="hero-visual">
          <WalleOnGlobe />
        </div>

        <section className="how-section">
          <Reveal><h2>Как это работает</h2></Reveal>
          <div className="how-container">
            <Reveal delay={0} className="how-item">
              <div className="how-step">01</div>
              <IconIdea size={36} />
              <div className="how-title">Задумай идею</div>
              <div className="how-desc">Опиши концепцию будущего артефакта — от киберпанк-клинка до древнего свитка.</div>
            </Reveal>
            <Reveal delay={0.12} className="how-item">
              <div className="how-step">02</div>
              <IconCreate size={36} />
              <div className="how-title">Создай артефакт</div>
              <div className="how-desc">AI воплощает идею в уникальный цифровой артефакт за считаные секунды.</div>
            </Reveal>
            <Reveal delay={0.24} className="how-item">
              <div className="how-step">03</div>
              <IconLegend size={36} />
              <div className="how-title">Стань легендой</div>
              <div className="how-desc">Продай за TimeCoin, поднимись в Зале Славы, войди в историю OSGARD.</div>
            </Reveal>
          </div>
        </section>

        <section className="examples-section">
          <Reveal><h2>Примеры проектов</h2></Reveal>
          <div className="examples-container">
            <Reveal delay={0} className="example-card">
              <div className="example-preview example-preview-1" />
              <div className="example-body">
                <IconMarket size={28} />
                <div className="example-title">Магазин артефактов</div>
                <div className="example-desc">Витрина для продажи уникальных артефактов сообществу.</div>
              </div>
            </Reveal>
            <Reveal delay={0.12} className="example-card">
              <div className="example-preview example-preview-2" />
              <div className="example-body">
                <IconDialogue size={28} />
                <div className="example-title">Живой диалог</div>
                <div className="example-desc">Интерактивные истории и сюжетные миры с AI-персонажами.</div>
              </div>
            </Reveal>
            <Reveal delay={0.24} className="example-card">
              <div className="example-preview example-preview-3" />
              <div className="example-body">
                <IconDashboard size={28} />
                <div className="example-title">Личный дашборд</div>
                <div className="example-desc">Аналитика роста твоей вселенной и коллекции артефактов.</div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="architects-section">
          <h2>Архитекторы вселенной</h2>
          <div className="cards-container">
            <article className="card gold">
              <div className="card-avatar">
                <Crown size={28} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="card-name">OSGARD_ORIGIN</div>
              <div className="card-level">ELYSIAN GRANDMASTER</div>
              <div className="card-rating">
                <InfinityIcon size={16} strokeWidth={1.2} aria-hidden="true" /> (1st)
              </div>
              <div className="card-achievements">
                HALL OF FAME LEADER
                <br />
                12 ARTIFICIAL WONDERS
              </div>
              <div className="card-icons">
                <Award size={18} strokeWidth={1.2} aria-hidden="true" />
                <Star size={18} strokeWidth={1.2} aria-hidden="true" />
                <Crown size={18} strokeWidth={1.2} aria-hidden="true" />
              </div>
            </article>

            <article className="card silver">
              <div className="card-avatar">
                <Gem size={28} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="card-name">MEDUSA_CODE</div>
              <div className="card-level">CYBER-ORACLE</div>
              <div className="card-rating">Top 2</div>
              <div className="card-achievements">
                MASTER OF ALGORITHMS
                <br />9 ARTIFICIAL WONDERS
              </div>
              <div className="card-icons">
                <Award size={18} strokeWidth={1.2} aria-hidden="true" />
                <Star size={18} strokeWidth={1.2} aria-hidden="true" />
                <Crown size={18} strokeWidth={1.2} aria-hidden="true" />
              </div>
            </article>

            <article className="card bronze">
              <div className="card-avatar">
                <Shield size={28} strokeWidth={1.2} aria-hidden="true" />
              </div>
              <div className="card-name">ASSARD1_VALKYRIE</div>
              <div className="card-level">WAR-FORGED ARTISAN</div>
              <div className="card-rating">Top 3</div>
              <div className="card-achievements">
                COMBAT ARTIFACT PIONEER
                <br />7 ARTIFICIAL WONDERS
              </div>
              <div className="card-icons">
                <Award size={18} strokeWidth={1.2} aria-hidden="true" />
                <Star size={18} strokeWidth={1.2} aria-hidden="true" />
                <Crown size={18} strokeWidth={1.2} aria-hidden="true" />
              </div>
            </article>
          </div>
        </section>

        <section className="economy-section">
          <Reveal><h2>Экономика артефактов</h2></Reveal>
          <div className="values-container">
            <Reveal delay={0} className="value-item">
              <IconTrade size={32} />
              <div className="value-title">Торгуй</div>
              <div className="value-desc">Продавай и покупай артефакты на открытом рынке TimeCoin.</div>
            </Reveal>
            <Reveal delay={0.12} className="value-item">
              <IconEarn size={32} />
              <div className="value-title">Зарабатывай</div>
              <div className="value-desc">Получай TimeCoin за каждый созданный шедевр.</div>
            </Reveal>
            <Reveal delay={0.24} className="value-item">
              <IconInvest size={32} />
              <div className="value-title">Инвестируй</div>
              <div className="value-desc">Вкладывай накопленное в новые вселенные и расти вместе с платформой.</div>
            </Reveal>
          </div>
        </section>

        <section className="community-section">
          <Reveal className="community-inner">
            <IconCommunity size={40} />
            <h2>Готов оставить свой след в вечности?</h2>
            <p className="community-desc">Присоединяйся к элите архитекторов и развивай вселенную вместе с ними.</p>
            <Link href="/register" className="final-cta-btn">
              Создать артефакт <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
          </Reveal>
        </section>
      </div>

      <style>{CSS}</style>
    </div>
  )
}

const WM_CSS = `.wm-scene{position:absolute;bottom:32px;right:6%;z-index:10;pointer-events:none;display:flex;flex-direction:column;align-items:center;opacity:0;animation:wm-rise 0.9s cubic-bezier(0.2,0.8,0.2,1) 0.3s forwards}.wm-svg{width:180px;height:252px;shape-rendering:geometricPrecision;filter:drop-shadow(0 18px 30px rgba(0,0,0,0.55)) drop-shadow(0 2px 6px rgba(0,0,0,0.5))}.wm-echo-badge{margin-top:10px;font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:#8A8578;opacity:0.7;font-family:monospace}.wm-bubble{margin-top:6px;background:rgba(6,7,12,0.96);border:1px solid rgba(180,170,150,0.16);border-radius:6px;padding:7px 16px;font-size:11px;font-weight:400;color:#B5AD98;white-space:nowrap;letter-spacing:0.04em;font-family:monospace}@keyframes wm-rise{0%{opacity:0;transform:translateY(24px)}100%{opacity:1;transform:translateY(0)}}@media(max-width:600px){.wm-scene{right:4%;bottom:16px}.wm-svg{width:140px;height:196px}.wm-bubble{font-size:10px;padding:6px 12px}.wm-echo-badge{font-size:8px}}`

// ─── ВАЛЛИ минималистичный ──────────────────────────────────────────
function WalleOnGlobe() {
  const { t } = useTranslation()
  return (
    <div className="wm-scene" aria-label={t("walli.echoAriaLabel")}>
      <svg className="wm-svg" viewBox="-10 0 120 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <linearGradient id="wallHead" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5A4A34"/>
            <stop offset="45%" stopColor="#3A2E20"/>
            <stop offset="100%" stopColor="#221808"/>
          </linearGradient>
          <linearGradient id="wallBody" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#54432E"/>
            <stop offset="50%" stopColor="#362A1C"/>
            <stop offset="100%" stopColor="#1C1409"/>
          </linearGradient>
          <linearGradient id="wallLimb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4A3B28"/>
            <stop offset="100%" stopColor="#241A0E"/>
          </linearGradient>
          <radialGradient id="wallEye" cx="36%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#E9CE9C"/>
            <stop offset="30%" stopColor="#A87A3E"/>
            <stop offset="70%" stopColor="#432E16"/>
            <stop offset="100%" stopColor="#100B05"/>
          </radialGradient>
        </defs>

        {/* Антенна */}
        <line x1="50" y1="10" x2="50" y2="2" stroke="#7A6A54" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="50" cy="1.5" r="2.5" fill="#5A4A34"/>
        <circle cx="49.3" cy="0.8" r="0.9" fill="#C8B890" opacity="0.6"/>

        {/* Голова — гранёный металл */}
        <rect x="20" y="10" width="60" height="30" rx="3" fill="url(#wallHead)" stroke="#6B5A3E" strokeWidth="0.5" strokeOpacity="0.4"/>
        <rect x="21" y="11" width="58" height="4" rx="2" fill="#7A6A4E" opacity="0.35"/>
        <rect x="20" y="37" width="60" height="3" rx="0" fill="#100B05" opacity="0.55"/>

        {/* Глаз левый — стеклянная линза */}
        <circle cx="34" cy="25" r="10" fill="#100B05"/>
        <circle cx="34" cy="25" r="8.2" fill="url(#wallEye)"/>
        <ellipse cx="35.9" cy="22.2" rx="1.7" ry="1.1" fill="#F6E7C4" opacity="0.7"/>

        {/* Глаз правый */}
        <circle cx="66" cy="25" r="10" fill="#100B05"/>
        <circle cx="66" cy="25" r="8.2" fill="url(#wallEye)"/>
        <ellipse cx="67.9" cy="22.2" rx="1.7" ry="1.1" fill="#F6E7C4" opacity="0.7"/>

        {/* Шея */}
        <rect x="44" y="40" width="12" height="12" rx="2" fill="#221808"/>

        {/* Тело */}
        <rect x="18" y="52" width="64" height="42" rx="3" fill="url(#wallBody)" stroke="#6B5A3E" strokeWidth="0.5" strokeOpacity="0.3"/>
        <rect x="18" y="52" width="5" height="42" fill="#100B05" opacity="0.5"/>
        <rect x="77" y="52" width="5" height="42" fill="#100B05" opacity="0.5"/>
        <rect x="23" y="53" width="54" height="2.5" rx="1" fill="#8A7A5A" opacity="0.3"/>

        {/* Панель управления */}
        <rect x="26" y="60" width="32" height="20" rx="2" fill="#1C130A"/>
        <rect x="28" y="62" width="28" height="6" rx="1" fill="#6E5A38" opacity="0.22"/>
        <text x="42" y="75" textAnchor="middle" fontFamily="monospace" fontWeight="600" fontSize="5.5" fill="#9A8A68" opacity="0.75" letterSpacing="1.2">WALL·E</text>

        {/* Индикатор состояния — приглушённый */}
        <rect x="66" y="62" width="6" height="12" rx="1.5" fill="#140D06"/>
        <rect x="67" y="63.5" width="4" height="1.8" rx="0.5" fill="#8A6A38" opacity="0.55"/>
        <rect x="67" y="67" width="4" height="1.8" rx="0.5" fill="#6E5228" opacity="0.4"/>
        <rect x="67" y="70.5" width="4" height="1.8" rx="0.5" fill="#4A3818" opacity="0.28"/>

        {/* Рука левая */}
        <rect x="0" y="58" width="18" height="6" rx="3" fill="url(#wallLimb)"/>
        <rect x="-6" y="62" width="12" height="12" rx="2" fill="#221808"/>
        <rect x="-5" y="63" width="10" height="2.5" rx="1" fill="#6E5A38" opacity="0.3"/>

        {/* Рука правая */}
        <rect x="82" y="58" width="18" height="6" rx="3" fill="url(#wallLimb)"/>
        <line x1="100" y1="60" x2="105" y2="55" stroke="#221808" strokeWidth="2" strokeLinecap="round"/>
        <line x1="100" y1="63" x2="105" y2="68" stroke="#221808" strokeWidth="2" strokeLinecap="round"/>
        <circle cx="106" cy="54.5" r="1.8" fill="#140D06"/>
        <circle cx="106" cy="68.5" r="1.8" fill="#140D06"/>

        {/* Гусеницы */}
        <rect x="12" y="94" width="28" height="14" rx="7" fill="#160F06"/>
        <rect x="14" y="100" width="5" height="5" rx="1" fill="#241A0E" opacity="0.9"/>
        <rect x="21" y="100" width="5" height="5" rx="1" fill="#241A0E" opacity="0.9"/>
        <rect x="28" y="100" width="5" height="5" rx="1" fill="#241A0E" opacity="0.9"/>
        <ellipse cx="14.5" cy="101" rx="5" ry="6" fill="#1C1206"/>
        <ellipse cx="37.5" cy="101" rx="5" ry="6" fill="#1C1206"/>

        <rect x="60" y="94" width="28" height="14" rx="7" fill="#160F06"/>
        <rect x="62" y="100" width="5" height="5" rx="1" fill="#241A0E" opacity="0.9"/>
        <rect x="69" y="100" width="5" height="5" rx="1" fill="#241A0E" opacity="0.9"/>
        <rect x="76" y="100" width="5" height="5" rx="1" fill="#241A0E" opacity="0.9"/>
        <ellipse cx="62.5" cy="101" rx="5" ry="6" fill="#1C1206"/>
        <ellipse cx="85.5" cy="101" rx="5" ry="6" fill="#1C1206"/>

        {/* Тень */}
        <ellipse cx="50" cy="118" rx="36" ry="3" fill="rgba(0,0,0,0.35)"/>
      </svg>
      <div className="wm-echo-badge">{t("walli.echoBadge")}</div>
      <div className="wm-bubble" role="status">
        {t("walli.echoBubble")}
      </div>
      <style>{WM_CSS}</style>
    </div>
  )
}


const CSS = `
.eternity-page {
  position: relative;
  min-height: 100vh;
  background: #020408;
  color: #fff;
  font-family: var(--font-inter), 'Inter', 'Helvetica Neue', sans-serif;
  font-weight: 400;
  overflow-x: hidden;
}
.eternity-page *{ box-sizing: border-box; }

.eternity-page #globe-bg {
  position: fixed; top: 0; left: 0;
  width: 100vw; height: 100vh;
  z-index: 0; pointer-events: auto; overflow: hidden;
}
.eternity-page #three-container { width: 100%; height: 100%; display: block; cursor: default; }

.eternity-page #particles {
  position: fixed; top: 0; left: 0;
  width: 100vw; height: 100vh; pointer-events: none; z-index: 1;
}
.eternity-page .particle {
  position: absolute; width: 1.5px; height: 1.5px;
  background: rgba(160, 200, 255, 0.15); border-radius: 50%;
  animation: eternity-float 30s infinite linear; opacity: 0;
}
@keyframes eternity-float {
  0% { transform: translateY(0) translateX(0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  100% { transform: translateY(-100vh) translateX(40px); opacity: 0; }
}

.eternity-page .site-nav {
  position: fixed; top: 0; left: 0; right: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 48px; background: transparent; border-bottom: 1px solid transparent;
  backdrop-filter: none; -webkit-backdrop-filter: none;
  transition: background-color 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease;
}
.eternity-page .site-nav.scrolled {
  background: rgba(4, 6, 12, 0.72);
  border-bottom-color: rgba(212, 175, 55, 0.12);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
}
.eternity-page .site-nav-logo {
  display: inline-flex; align-items: center;
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 20px; font-weight: 700; letter-spacing: 0.06em; color: #fff;
  text-decoration: none;
}
.eternity-page .site-nav-logo-glyph { margin: 0 1px; color: var(--eg-gold-1); }
.eternity-page .site-nav-links { display: flex; align-items: center; gap: 20px; }
.eternity-page .site-nav-link {
  font-size: 14px; font-weight: 500; color: rgba(255, 255, 255, 0.65);
  text-decoration: none; transition: color 0.2s ease;
}
.eternity-page .site-nav-link:hover { color: #fff; }
.eternity-page .site-nav-link-primary {
  padding: 8px 18px; border-radius: 30px; color: #0A0D14;
  background: linear-gradient(135deg, var(--eg-gold-1), var(--eg-gold-3));
}
.eternity-page .site-nav-link-primary:hover { color: #0A0D14; box-shadow: 0 0 20px rgba(212, 175, 55, 0.35); }
@media (max-width: 600px) {
  .eternity-page .site-nav { padding: 16px 20px; }
  .eternity-page .site-nav-logo { font-size: 17px; }
  .eternity-page .site-nav-links { gap: 12px; }
}

.eternity-page .container {
  max-width: 1440px; margin: 0 auto; padding: 80px;
  padding-top: 158px;
  position: relative; z-index: 2;
  display: grid; grid-template-columns: 1fr 1fr; gap: 100px 40px;
  min-height: 100vh;
}

.eternity-page .hero-content {
  display: flex; flex-direction: column; justify-content: center;
  align-items: flex-start; gap: 24px;
}
.eternity-page .hero-visual { position: relative; }
.eternity-page h1 {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 64px; font-weight: 700; color: #fff;
  letter-spacing: 0; line-height: 1.1;
  text-shadow: 0 0 80px rgba(212, 175, 55, 0.08);
  animation: eternity-rise 1s ease-out forwards;
}
.eternity-page .hero-subtitle {
  font-size: 18px; font-weight: 300; color: #B0C0D8;
  max-width: 560px; line-height: 1.6; letter-spacing: 0.03em;
  animation: eternity-rise 1s ease-out 0.2s forwards; opacity: 0;
}
.eternity-page .ico { display: inline-block; vertical-align: middle; }
.eternity-page .hero-subtitle .ico.gold {
  color: #FFD700; stroke-width: 1.2;
  filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.3));
}

.eternity-page .artifact-form {
  display: flex; align-items: center; gap: 12px;
  width: 100%; max-width: 560px;
  animation: eternity-rise 1s ease-out 0.4s forwards; opacity: 0; margin-top: 4px;
}
.eternity-page .artifact-form input {
  flex: 1; background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 40px;
  padding: 10px 18px; font-size: 14px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  color: #fff; outline: none;
  transition: border-color 0.3s, box-shadow 0.3s;
  height: 44px; letter-spacing: 0.02em;
}
.eternity-page .artifact-form input::placeholder { color: #4A5A6A; font-weight: 300; }
.eternity-page .artifact-form input:focus {
  border-color: #FFD700; box-shadow: 0 0 20px rgba(255, 215, 0, 0.05);
}
.eternity-page .artifact-form button {
  position: relative; overflow: hidden;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: none; border-radius: 40px; padding: 10px 24px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-weight: 600; font-size: 14px; color: #0A0D14; cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease; white-space: nowrap; height: 44px;
  display: flex; align-items: center; gap: 8px; letter-spacing: 0.04em;
}
.eternity-page .artifact-form button::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 66%);
  transform: translateX(-120%); transition: transform 0.55s ease;
}
.eternity-page .artifact-form button:hover {
  transform: scale(1.03); box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
}
.eternity-page .artifact-form button:hover::before { transform: translateX(120%); }
.eternity-page .artifact-form button svg { stroke: #0A0D14; stroke-width: 2; position: relative; }

.eternity-page .architects-section h2,
.eternity-page .how-section h2,
.eternity-page .examples-section h2,
.eternity-page .economy-section h2 {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 28px; text-align: center; color: #fff;
  grid-column: 1/-1; margin-bottom: 40px; letter-spacing: 2px;
  text-shadow: 0 0 40px rgba(255, 215, 0, 0.05);
}
.eternity-page .architects-section { grid-column: 1/-1; margin-top: 96px; }
.eternity-page .how-section { grid-column: 1/-1; margin-top: 96px; }
.eternity-page .examples-section { grid-column: 1/-1; margin-top: 96px; }
.eternity-page .economy-section { grid-column: 1/-1; margin-top: 96px; }

.eternity-page .cards-container,
.eternity-page .values-container {
  display: flex; gap: 32px; justify-content: center; flex-wrap: wrap;
}

.eternity-page .card,
.eternity-page .value-item {
  position: relative;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 16px; padding: 40px 32px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(10, 17, 40, 0.35); opacity: 0;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  letter-spacing: 0.02em; width: 100%; max-width: 280px; text-align: center;
  transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
}
.eternity-page .card::before,
.eternity-page .value-item::before {
  content: ""; position: absolute; inset: 0; border-radius: 16px; padding: 1px;
  background: linear-gradient(150deg, var(--eg-gold-1), var(--eg-gold-3) 60%, transparent);
  opacity: 0.35;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none;
}
.eternity-page .card::after,
.eternity-page .value-item::after,
.eternity-page .how-item::after,
.eternity-page .example-card::after,
.eternity-page .community-inner::after {
  content: ""; position: absolute; inset: 0; border-radius: inherit;
  opacity: 0.04; pointer-events: none; mix-blend-mode: overlay;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}
.eternity-page .card:hover,
.eternity-page .value-item:hover {
  transform: translateY(-4px);
  border-color: rgba(212, 175, 55, 0.3);
  box-shadow: var(--eg-glow-gold);
}
.eternity-page .card.gold { --card-color: #FFD700; animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.1s forwards; }
.eternity-page .card.silver { --card-color: #E0E0E0; animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.2s forwards; }
.eternity-page .card.bronze { --card-color: #CD7F32; animation: eternity-rise 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) 0.3s forwards; }

.eternity-page .card-avatar {
  width: 64px; height: 64px;
  background: radial-gradient(circle at 30% 30%, #1A2A4A, #0A0E1A 80%);
  border-radius: 50%; display: flex; align-items: center; justify-content: center;
  margin-bottom: 8px; color: var(--card-color, #fff);
  box-shadow: inset 0 0 20px rgba(0, 212, 255, 0.15), 0 0 30px rgba(255, 215, 0, 0.1);
  transition: all 0.4s ease; border: 1px solid rgba(255, 255, 255, 0.08);
}
.eternity-page .card:hover .card-avatar {
  box-shadow: inset 0 0 30px rgba(0, 212, 255, 0.3), 0 0 60px rgba(255, 215, 0, 0.3);
  transform: scale(1.05); border-color: var(--card-color);
}
.eternity-page .card-avatar svg {
  stroke-width: 1.2; filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.3));
}

.eternity-page .card-name { font-size: 24px; font-weight: 600; color: #fff; letter-spacing: 1px; }
.eternity-page .card-level { font-size: 14px; font-weight: 500; color: var(--card-color, #6A8A9A); letter-spacing: 2px; }
.eternity-page .card-rating {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 14px; color: #A0B0C8; display: flex; align-items: center; gap: 6px;
  background: rgba(0, 0, 0, 0.3); padding: 4px 14px; border-radius: 20px; letter-spacing: 0.05em;
}
.eternity-page .card-rating svg { stroke-width: 1.2; color: var(--card-color, #FFD700); }
.eternity-page .card-achievements {
  font-size: 12px; color: #6A7A8A; line-height: 1.6; margin-top: 8px; letter-spacing: 0.02em;
}
.eternity-page .card-icons {
  display: flex; gap: 12px; margin-top: 16px; color: var(--card-color, #6A8A9A);
  filter: drop-shadow(0 0 8px rgba(255, 215, 0, 0.2));
}
.eternity-page .card-icons svg { stroke-width: 1.2; transition: all 0.3s ease; }
.eternity-page .card:hover .card-icons svg { filter: drop-shadow(0 0 12px rgba(255, 215, 0, 0.5)); }

.eternity-page .economy-section .value-item {
  max-width: 280px; opacity: 1; animation: none; gap: 16px; --card-color: #7AACFF;
}
.eternity-page .value-title { font-size: 18px; font-weight: 600; color: #fff; letter-spacing: 1px; }
.eternity-page .value-desc { font-size: 14px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

@keyframes eternity-rise {
  0% { opacity: 0; transform: translateY(30px); }
  100% { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1100px) {
  .eternity-page .container { grid-template-columns: 1fr; gap: 60px; }
  .eternity-page .hero-content { align-items: center; text-align: center; }
  .eternity-page .hero-visual { min-height: 340px; }
  .eternity-page h1 { font-size: 48px; }
  .eternity-page .artifact-form { max-width: 100%; }
}
@media (max-width: 600px) {
  .eternity-page .container { padding-top: 128px; }
  .eternity-page .hero-visual { min-height: 260px; }
  .eternity-page h1 { font-size: 36px; }
  .eternity-page .artifact-form { flex-direction: column; gap: 10px; }
  .eternity-page .artifact-form input,
  .eternity-page .artifact-form button { width: 100%; height: 44px; }
}

/* ─── Spinner на кнопке ─── */
.eternity-page .artifact-form button.submitting {
  opacity: 0.85; cursor: wait;
}
.btn-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid rgba(10,13,20,0.3);
  border-top-color: #0A0D14;
  border-radius: 50%;
  animation: btn-spin 0.7s linear infinite;
  flex-shrink: 0;
}
@keyframes btn-spin {
  to { transform: rotate(360deg); }
}

/* ─── Модальное окно ─── */
.artifact-modal-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; align-items: center; justify-content: center;
  background: rgba(2, 4, 8, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: modal-fade-in 0.25s ease-out forwards;
}
@keyframes modal-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.artifact-confetti-canvas {
  position: fixed; inset: 0;
  pointer-events: none; z-index: 10000;
}

.artifact-modal-card {
  position: relative; z-index: 10001;
  background: linear-gradient(145deg, #0E1420, #0A0D18);
  border: 1px solid rgba(255, 215, 0, 0.18);
  border-radius: 20px;
  padding: 48px 40px 40px;
  max-width: 420px; width: calc(100% - 32px);
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  text-align: center;
  box-shadow: 0 0 80px rgba(255, 215, 0, 0.08), 0 32px 64px rgba(0,0,0,0.6);
  animation: modal-card-in 0.35s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}
@keyframes modal-card-in {
  from { opacity: 0; transform: scale(0.88) translateY(20px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

.artifact-modal-close {
  position: absolute; top: 16px; right: 16px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 50%; width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  color: #6A7A8A; cursor: pointer; transition: all 0.2s;
}
.artifact-modal-close:hover {
  background: rgba(255,255,255,0.1); color: #fff;
  border-color: rgba(255,215,0,0.3);
}

.artifact-modal-icon {
  position: relative; width: 80px; height: 80px;
  display: flex; align-items: center; justify-content: center;
  color: #FFD700; margin-bottom: 4px;
}
.artifact-modal-icon-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(255,215,0,0.3);
  animation: icon-ring-pulse 2s ease-in-out infinite;
}
@keyframes icon-ring-pulse {
  0%, 100% { transform: scale(1); opacity: 0.4; }
  50%       { transform: scale(1.15); opacity: 0.9; }
}
.artifact-modal-icon svg {
  filter: drop-shadow(0 0 20px rgba(255,215,0,0.5));
  animation: icon-appear 0.5s cubic-bezier(0.2,0.8,0.2,1) 0.15s both;
}
@keyframes icon-appear {
  from { transform: scale(0) rotate(-20deg); opacity: 0; }
  to   { transform: scale(1) rotate(0deg); opacity: 1; }
}

.artifact-modal-title {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 28px; font-weight: 700; color: #fff;
  letter-spacing: 2px;
}
.artifact-modal-subtitle {
  font-size: 14px; color: #6A7A8A; letter-spacing: 0.04em;
}
.artifact-modal-name {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 600; color: #FFD700;
  background: rgba(255,215,0,0.06);
  border: 1px solid rgba(255,215,0,0.15);
  border-radius: 12px; padding: 10px 20px;
  letter-spacing: 0.02em; word-break: break-word;
  max-width: 100%;
}
.artifact-modal-name svg { flex-shrink: 0; color: #FFA500; }
.artifact-modal-desc {
  font-size: 14px; color: #8090A8; letter-spacing: 0.03em;
}
.artifact-modal-highlight {
  color: #FFD700; font-weight: 600;
  filter: drop-shadow(0 0 8px rgba(255,215,0,0.3));
}
.artifact-modal-btn {
  margin-top: 12px;
  background: linear-gradient(135deg, #FFD700, #FFA500);
  border: none; border-radius: 40px; padding: 12px 32px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-weight: 700; font-size: 15px; color: #0A0D14;
  cursor: pointer; transition: all 0.3s ease;
  display: flex; align-items: center; gap: 8px;
  letter-spacing: 0.04em;
  box-shadow: 0 0 30px rgba(255,215,0,0.2);
}
.artifact-modal-btn:hover {
  transform: scale(1.04);
  box-shadow: 0 0 50px rgba(255,215,0,0.4);
}
.artifact-modal-btn svg { stroke: #0A0D14; }

/* ─── TimeCoin-бейдж ─── */
.eternity-page .tc-badge {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 12px; font-weight: 600; color: var(--eg-gold-1);
  background: rgba(212, 175, 55, 0.08); border: 1px solid rgba(212, 175, 55, 0.25);
  border-radius: 20px; padding: 6px 14px; letter-spacing: 0.06em; text-transform: uppercase;
  animation: eternity-rise 1s ease-out 0.1s forwards; opacity: 0;
}
.eternity-page .tc-badge svg { color: var(--eg-gold-1); filter: drop-shadow(0 0 6px rgba(212, 175, 55, 0.5)); }
.eternity-page .tc-badge-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--eg-gold-1); box-shadow: 0 0 8px rgba(247, 224, 94, 0.8);
}

/* ─── Виньетка вокруг глобуса ─── */
.eternity-page #globe-vignette {
  position: absolute; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(circle at center, transparent 35%, rgba(6, 6, 11, 0.85) 90%);
}

/* ─── Премиум-иконки: hover glow ─── */
.eternity-page .eg-icon-svg {
  filter: drop-shadow(0 0 8px rgba(212, 175, 55, 0.3));
  transition: transform 0.3s ease;
}
.eternity-page .how-item:hover .eg-icon-svg,
.eternity-page .example-body:hover .eg-icon-svg,
.eternity-page .value-item:hover .eg-icon-svg,
.eternity-page .community-inner:hover .eg-icon-svg {
  animation: eg-icon-glow 1.6s ease-in-out infinite;
  transform: scale(1.08);
}

/* ─── «Как это работает» ─── */
.eternity-page .how-container {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
}
.eternity-page .how-item {
  position: relative;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 16px; padding: 40px 32px; width: 100%; max-width: 300px;
  display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(10, 17, 40, 0.35);
  transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
}
.eternity-page .how-item::before {
  content: ""; position: absolute; inset: 0; border-radius: 16px; padding: 1px;
  background: linear-gradient(150deg, var(--eg-gold-1), var(--eg-gold-3) 60%, transparent);
  opacity: 0.35;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none;
}
.eternity-page .how-item:hover {
  transform: translateY(-4px); border-color: rgba(212, 175, 55, 0.3); box-shadow: var(--eg-glow-gold);
}
.eternity-page .how-step {
  font-family: var(--font-space), sans-serif; font-size: 13px; font-weight: 700;
  color: var(--eg-gold-2); letter-spacing: 0.1em; opacity: 0.7;
}
.eternity-page .how-title { font-size: 18px; font-weight: 600; color: #fff; letter-spacing: 0.5px; margin-top: 4px; }
.eternity-page .how-desc { font-size: 14px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

/* ─── «Примеры проектов» ─── */
.eternity-page .examples-container {
  display: flex; gap: 24px; justify-content: center; flex-wrap: wrap;
}
.eternity-page .example-card {
  position: relative; overflow: hidden;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 16px; width: 100%; max-width: 320px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(10, 17, 40, 0.35);
  transition: transform 0.35s cubic-bezier(0.22,1,0.36,1), box-shadow 0.35s ease, border-color 0.35s ease;
}
.eternity-page .example-card::before {
  content: ""; position: absolute; inset: 0; border-radius: 16px; padding: 1px;
  background: linear-gradient(150deg, var(--eg-gold-1), var(--eg-gold-3) 60%, transparent);
  opacity: 0.35;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none; z-index: 1;
}
.eternity-page .example-card:hover {
  transform: translateY(-4px); border-color: rgba(212, 175, 55, 0.3); box-shadow: var(--eg-glow-gold);
}
.eternity-page .example-preview { height: 140px; width: 100%; }
.eternity-page .example-preview-1 { background: radial-gradient(circle at 30% 30%, rgba(212,175,55,0.35), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-2 { background: radial-gradient(circle at 70% 40%, rgba(106,90,205,0.35), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-3 { background: radial-gradient(circle at 50% 70%, rgba(45,125,210,0.3), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-body {
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
  padding: 24px;
}
.eternity-page .example-title { font-size: 16px; font-weight: 600; color: #fff; letter-spacing: 0.5px; }
.eternity-page .example-desc { font-size: 13px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

/* ─── «Сообщество» ─── */
.eternity-page .community-section { grid-column: 1/-1; margin-top: 96px; margin-bottom: 40px; display: flex; justify-content: center; }
.eternity-page .community-inner {
  position: relative; text-align: center; max-width: 560px; width: 100%;
  background: var(--eg-glass-bg); border: 1px solid var(--eg-glass-border);
  border-radius: 20px; padding: 48px 32px;
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 8px 32px rgba(10, 17, 40, 0.35);
  display: flex; flex-direction: column; align-items: center; gap: 14px;
}
.eternity-page .community-inner::before {
  content: ""; position: absolute; inset: 0; border-radius: 20px; padding: 1px;
  background: linear-gradient(150deg, var(--eg-gold-1), var(--eg-gold-3) 60%, transparent);
  opacity: 0.35;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  pointer-events: none;
}
.eternity-page .community-inner:hover {
  border-color: rgba(212, 175, 55, 0.3); box-shadow: var(--eg-glow-gold);
}
.eternity-page .community-inner h2 {
  font-family: var(--font-playfair), 'Playfair Display', serif;
  font-size: 28px; color: #fff; letter-spacing: 2px; margin: 0;
}
.eternity-page .community-desc { font-size: 15px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

.eternity-page .final-cta-btn {
  position: relative; overflow: hidden;
  display: inline-flex; align-items: center; gap: 10px;
  background: linear-gradient(135deg, var(--eg-gold-1), var(--eg-gold-3));
  border: none; border-radius: 40px; padding: 14px 32px;
  font-family: var(--font-inter), 'Inter', sans-serif;
  font-weight: 700; font-size: 15px; color: #0A0D14; cursor: pointer;
  transition: transform 0.3s ease, box-shadow 0.3s ease; letter-spacing: 0.04em;
}
.eternity-page .final-cta-btn::before {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.55) 48%, transparent 66%);
  transform: translateX(-120%); transition: transform 0.55s ease;
}
.eternity-page .final-cta-btn::after {
  content: "∞"; margin-left: 2px; font-family: var(--font-playfair), 'Playfair Display', serif;
  opacity: 0; transform: translateX(-4px); transition: opacity 0.3s ease, transform 0.3s ease;
}
.eternity-page .final-cta-btn:hover {
  transform: scale(1.03); box-shadow: var(--eg-glow-gold);
}
.eternity-page .final-cta-btn:hover::before { transform: translateX(120%); }
.eternity-page .final-cta-btn:hover::after { opacity: 0.8; transform: translateX(0); }

@media (max-width: 1100px) {
  .eternity-page .how-container,
  .eternity-page .examples-container,
  .eternity-page .values-container { flex-direction: column; align-items: center; }
  .eternity-page .community-inner { padding: 36px 24px; }
}

`
