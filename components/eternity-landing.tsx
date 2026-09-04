"use client"

import { useEffect, useRef, useState, type FormEvent, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import {
  Infinity as InfinityIcon,
  ArrowRight,
  Crown,
  Gem,
  Shield,
  Award,
  Star,
  Smartphone,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { useAuth } from "@/lib/auth-store"
import { generateProjectFromIdea } from "@/lib/project-generation"
import { savePendingGeneration } from "@/lib/pending-generation"
import { startGuestSession } from "@/lib/guest-session"
import { buildProjectBrief, isProjectBriefAnswerComplete, isProjectBriefComplete } from "@/lib/project-brief"
import { track } from "@/lib/analytics"
import { Reveal } from "@/components/landing/Reveal"
import {
  IconIdea,
  IconCreate,
  IconLegend,
  IconDashboard,
  IconVPN,
  IconCommunity,
  IconTrade,
  IconEarn,
  IconInvest,
} from "@/components/icons/premium"

const GlobeScene = dynamic(() => import("@/components/landing/GlobeScene"), {
  ssr: false,
})

const LivePulseBar = dynamic(
  () => import("@/components/live-pulse-bar").then((m) => m.LivePulseBar),
  { ssr: false },
)

const RUSTORE_APP_URL = "https://www.rustore.ru/catalog/app/com.osgard.app"


export function EternityLanding() {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const briefDialogRef = useRef<HTMLFormElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [globeReady, setGlobeReady] = useState(false)
  const [pulseReady, setPulseReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [briefIdea, setBriefIdea] = useState<string | null>(null)
  const [brief, setBrief] = useState({ audience: "", outcome: "", essentials: "", constraints: "" })
  const [briefStep, setBriefStep] = useState(0)
  /** Вопрос платформы, когда заявку не удалось прочитать (422 unclear_request). */
  const [clarify, setClarify] = useState<{ question: string; received?: string } | null>(null)
  const heroValueBadge = locale === "en"
    ? "BUILD PRODUCTS THAT MATTER"
    : locale === "kz"
      ? "НАҚТЫ ПАЙДАЛЫ ӨНІМДЕР ЖАСАҢЫЗ"
      : "СОЗДАВАЙТЕ ПРОДУКТЫ С РЕАЛЬНОЙ ПОЛЬЗОЙ"
  const heroValueSubtitle = locale === "en"
    ? "Create working projects, validate ideas, and grow products people genuinely use."
    : locale === "kz"
      ? "Жұмыс істейтін жобалар жасаңыз, идеяларды тексеріңіз және адамдар қолданатын өнімдерді дамытыңыз."
      : "Создавайте рабочие проекты, проверяйте идеи и развивайте продукты, которыми люди действительно пользуются."

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    if (!briefIdea) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const focusable = () => Array.from(
      briefDialogRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      ) ?? [],
    )

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setBriefIdea(null)
        return
      }
      if (event.key !== "Tab") return

      const controls = focusable()
      if (!controls.length) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    requestAnimationFrame(() => focusable()[0]?.focus())
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previousFocus?.focus()
    }
  }, [briefIdea, briefStep])

  useEffect(() => {
    let timer: number | undefined
    const startPulse = () => {
      timer = window.setTimeout(() => setPulseReady(true), 1_500)
    }
    if (document.readyState === "complete") startPulse()
    else window.addEventListener("load", startPulse, { once: true })
    return () => {
      window.removeEventListener("load", startPulse)
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    // Keep the project's visual signature, but reserve initial main-thread time
    // for the page title and the project-creation field.
    let timer: number | undefined
    let idleCallback: number | undefined
    const idleWindow = window as unknown as {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
      cancelIdleCallback?: (handle: number) => void
    }
    const startGlobe = () => {
      const showGlobe = () => setGlobeReady(true)
      if (typeof idleWindow.requestIdleCallback === "function") {
        // The globe is the visual signature, but the brief input is the first
        // interaction. Give hydration and the first paint a clear window first.
        idleCallback = idleWindow.requestIdleCallback(showGlobe, { timeout: 4_000 })
      } else {
        timer = window.setTimeout(showGlobe, 4_000)
      }
    }

    if (document.readyState === "complete") startGlobe()
    else window.addEventListener("load", startGlobe, { once: true })

    return () => {
      window.removeEventListener("load", startGlobe)
      if (timer !== undefined) window.clearTimeout(timer)
      if (idleCallback !== undefined) idleWindow.cancelIdleCallback?.(idleCallback)
    }
  }, [])

  const [particles, setParticles] = useState<
    { left: string; top: string; duration: string; delay: string }[]
  >([])
  useEffect(() => {
    Promise.resolve().then(() => {
      setParticles(
        Array.from({ length: window.matchMedia("(max-width: 600px)").matches ? 18 : 40 }).map(() => ({
          left: `${Math.random() * 100}vw`,
          top: `${Math.random() * 100}vh`,
          duration: `${Math.random() * 20 + 15}s`,
          delay: `${Math.random() * 10}s`,
        })),
      )
    })
  }, [])

  /** Короткая красная подсветка поля — переиспользуем для «пусто» и для ошибки генерации. */
  const flashInputError = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    el.style.borderColor = "#FF6B6B"
    el.style.boxShadow = "0 0 20px rgba(255, 107, 107, 0.3)"
    setTimeout(() => {
      el.style.borderColor = ""
      el.style.boxShadow = ""
    }, 1500)
  }, [])

  /* Ввод из hero → РЕАЛЬНАЯ генерация проекта (настоящий код + артефакты), а не демо-превью.
     Авторизован  → сразу POST /projects/generate и переход на страницу проекта, где уже
                     показывается статус 'generating' и результат.
     Гость        → сохраняем намерение (pending-generation) и уводим на регистрацию; после
                     входа дашборд сам заберёт намерение и запустит генерацию. */
  const startGeneration = async (query: string) => {
    if (submitting) return
    const el = inputRef.current
    setClarify(null)
    setCreateError(null)

    // Гость: поднимаем НАСТОЯЩУЮ гостевую сессию (cookie, JWT в JS не попадает) и
    // тут же генерируем реальный проект — первое впечатление без стены регистрации.
    // Проект переедет на аккаунт при регистрации (guest/claim). Если гостевую
    // сессию поднять не удалось из-за лимита по IP — сохраняем намерение и
    // предлагаем регистрацию. Временная ошибка не должна маскироваться переходом.
    if (!isAuthenticated) {
      setSubmitting(true)
      let guestResult: Awaited<ReturnType<typeof startGuestSession>> | null = null
      try {
        const guest = await startGuestSession()
        guestResult = guest
        if (guest.ok) {
          track("guest_generate_start", { existing: !!guest.existing })
          // Уже есть гостевой проект по этому IP — не плодим второй, ведём к нему.
          if (guest.existing && guest.hasProject && guest.projectId) {
            if (el) el.value = ""
            router.push(`/projects/${guest.projectId}/workspace`)
            return
          }
          const res = await generateProjectFromIdea(query)
          if (res.success && res.project) {
            if (el) el.value = ""
            router.push(`/projects/${res.project.id}/workspace`)
            return
          }
          /* Заявку не поняли — это не повод гнать гостя на регистрацию: там его
             будет ждать тот же непонятый текст. Спрашиваем здесь и сейчас. */
          if (res.unclearRequest) {
            setClarify({ question: res.error || "", received: res.received })
            flashInputError()
            setSubmitting(false)
            return
          }
          // The guest session is already valid at this point. Redirecting to
          // registration would hide an actionable generator response and lose
          // the person's place in the flow, so keep the brief in the field.
          setCreateError(res.error || t("landing.createError"))
          flashInputError()
          setSubmitting(false)
          return
        }
      } catch {
        /* падаем в fallback ниже */
      }
      if (guestResult?.code === "GUEST_LIMIT") {
        // Идея — бриф (hint), не имя: имя выведет бэкенд из неё же.
        savePendingGeneration({ hint: query })
        if (el) el.value = ""
        setSubmitting(false)
        router.push("/register?continue=project")
        return
      }

      setCreateError(guestResult?.message || t("landing.createError"))
      flashInputError()
      setSubmitting(false)
      return
    }

    setSubmitting(true)
    try {
      const res = await generateProjectFromIdea(query)
      if (res.success && res.project) {
        if (el) el.value = ""
        // Глубина по умолчанию — quick (бесплатно). Страница проекта покажет ход генерации.
        router.push(`/projects/${res.project.id}/workspace`)
        return
      }
      if (res.unclearRequest) setClarify({ question: res.error || "", received: res.received })
      else setCreateError(res.error || t("landing.createError"))
      flashInputError()
      setSubmitting(false)
    } catch {
      setCreateError(t("landing.createError"))
      flashInputError()
      setSubmitting(false)
    }
  }

  const handleIdeaSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    const query = inputRef.current?.value.trim() ?? ""
    if (!query) {
      flashInputError()
      return
    }
    setClarify(null)
    setCreateError(null)
    setBrief({ audience: "", outcome: "", essentials: "", constraints: "" })
    setBriefStep(0)
    setBriefIdea(query)
  }

  const handleBriefSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!briefIdea || submitting) return
    if (briefStep < 3) {
      if (!isProjectBriefAnswerComplete(briefStepValue)) return
      setBriefStep((current) => Math.min(3, current + 1))
      return
    }
    if (!isProjectBriefComplete(brief)) return
    const completeBrief = buildProjectBrief(briefIdea, brief)
    setBriefIdea(null)
    void startGeneration(completeBrief)
  }

  const briefReady = isProjectBriefComplete(brief)
  const briefStepValue = [brief.audience, brief.outcome, brief.essentials, brief.constraints][briefStep]
  const briefStepLabels = [
    t("landing.briefAudienceLabel"),
    t("landing.briefOutcomeLabel"),
    t("landing.briefEssentialsLabel"),
    t("landing.briefConstraintsLabel"),
  ]

  return (
    <div className="eternity-page">
      <style>{CSS}</style>
      {/* Глобус и частицы */}
      <div id="globe-bg">
        {globeReady ? <GlobeScene /> : null}
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

      {/* Гостевой demo-flow: реальная генерация проекта + артефактов + reveal */}
      {/* Прозрачная шапка */}
      {briefIdea && (
        <div className="project-brief-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setBriefIdea(null)
        }}>
          <form ref={briefDialogRef} className="project-brief-card" onSubmit={handleBriefSubmit} role="dialog" aria-modal="true" aria-labelledby="project-brief-title" aria-describedby="project-brief-description">
            <div className="project-brief-kicker">{t("landing.briefKicker")}</div>
            <h2 id="project-brief-title">{t("landing.briefTitle")}</h2>
            <p id="project-brief-description">{t("landing.briefDescription")}</p>
            <div className="project-brief-progress" aria-live="polite">{briefStep + 1} / 4</div>
            <label>{briefStepLabels[briefStep]} {briefStep === 3 && <span>{t("landing.briefOptional")}</span>}
              {briefStep === 2 ? (
                <textarea autoFocus value={brief.essentials} onChange={(e) => setBrief((current) => ({ ...current, essentials: e.target.value }))} placeholder={t("landing.briefEssentialsPlaceholder")} maxLength={600} rows={4} required aria-required="true" />
              ) : (
                <input autoFocus value={briefStep === 0 ? brief.audience : briefStep === 1 ? brief.outcome : brief.constraints} onChange={(e) => setBrief((current) => ({ ...current, [briefStep === 0 ? "audience" : briefStep === 1 ? "outcome" : "constraints"]: e.target.value }))} placeholder={briefStep === 0 ? t("landing.briefAudiencePlaceholder") : briefStep === 1 ? t("landing.briefOutcomePlaceholder") : t("landing.briefConstraintsPlaceholder")} maxLength={briefStep === 1 ? 240 : briefStep === 0 ? 240 : 400} required={briefStep < 3} aria-required={briefStep < 3 ? "true" : undefined} />
              )}
            </label>
            <div className="project-brief-actions">
              <button type="button" onClick={() => briefStep > 0 ? setBriefStep((current) => current - 1) : setBriefIdea(null)}>{briefStep > 0 ? t("projectWizard.back") : t("landing.briefBack")}</button>
              <button type="submit" disabled={(briefStep < 3 && !isProjectBriefAnswerComplete(briefStepValue)) || (briefStep === 3 && !briefReady) || submitting}>{briefStep === 3 ? t("landing.briefStart") : t("projectWizard.next")} <ArrowRight size={17} aria-hidden="true" /></button>
            </div>
          </form>
        </div>
      )}

      <header className={`site-nav${scrolled ? " scrolled" : ""}`}>
        <Link href="/" className="site-nav-logo" aria-label={t("landing.navHomeAria")}>
          OSG<InfinityIcon size={16} strokeWidth={2} className="site-nav-logo-glyph" aria-hidden="true" />RD
        </Link>
        <div className="site-nav-links">
          <a href={RUSTORE_APP_URL} className="site-nav-link site-nav-link-rustore" target="_blank" rel="noopener noreferrer">
            <Smartphone size={15} aria-hidden="true" />
            <span>RuStore</span>
          </a>
          <Link href="/login" className="site-nav-link site-nav-link-login">{t("landing.navLogin")}</Link>
          <Link href="/register" className="site-nav-link site-nav-link-primary">{t("landing.navRegister")}</Link>
        </div>
      </header>

      {/* Основной контент */}
      <div className="container">
        <header className="hero-content">
          <h1>
            {t("landing.heroTitleLine1")}
            <br />{t("landing.heroTitleLine2")}
          </h1>
          <div className="tc-badge">
            <InfinityIcon size={14} strokeWidth={1.4} aria-hidden="true" />
            {heroValueBadge}
            <span className="tc-badge-dot" aria-hidden="true" />
          </div>
          <p className="hero-subtitle">
            {heroValueSubtitle}
          </p>

          {/* Миниатюрное окно ввода (всегда видимо) */}
          <form className="artifact-form" onSubmit={handleIdeaSubmit} aria-busy={submitting}>
            <input
              ref={inputRef}
              type="text"
              name="projectIdea"
              placeholder={t("landing.inputPlaceholder")}
              maxLength={500}
              enterKeyHint="go"
              autoComplete="off"
              aria-label={t("landing.inputPlaceholder")}
              aria-describedby={clarify ? "landing-clarify" : createError ? "landing-create-error" : undefined}
              disabled={submitting}
            />
            <button type="submit" className={submitting ? "submitting" : undefined} disabled={submitting}>
              {submitting ? (
                <>
                  {t("landing.creatingBtn")} <span className="btn-spinner" aria-hidden="true" />
                </>
              ) : (
                <>
                  Уточнить проект <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* RuStore is kept in the top navigation; the hero stays focused on creation. */}
          {/* <a href={RUSTORE_APP_URL} className="hero-rustore-link" target="_blank" rel="noopener noreferrer">
            <span className="hero-rustore-icon"><Smartphone size={18} aria-hidden="true" /></span>
            <span>
              <strong>Скачать приложение OSGARD</strong>
              <small>Доступно в RuStore</small>
            </span>
            <ArrowRight size={17} aria-hidden="true" />
          </a> */}

          {/* Платформа не поняла заявку — спрашивает, а не выдумывает продукт.
              Раньше здесь была только красная вспышка поля: человек не узнавал
              ни что не так, ни что до сервера доехало (выстрел 30.07.2026 —
              битая кодировка молча превратилась в чужое приложение). */}
          {clarify && (
            <p id="landing-clarify" role="status" className="hero-clarify">
              {clarify.question}
              {clarify.received ? (
                <>
                  {" "}
                  <span className="hero-clarify-received">Мы прочитали: «{clarify.received}»</span>
                </>
              ) : null}
            </p>
          )}
          {createError && !clarify && (
            <p id="landing-create-error" role="alert" className="hero-clarify">
              {createError}
            </p>
          )}

          <div className="hero-pulse">
            {pulseReady ? <LivePulseBar variant="landing" /> : null}
          </div>

        </header>

        <section className="how-section">
          <Reveal><h2>От идеи до рабочего проекта</h2></Reveal>
          <div className="how-container">
            <Reveal delay={0} className="how-item">
              <div className="how-step">01</div>
              <div className="how-icon-badge"><IconIdea size={32} /></div>
              <div className="how-title">Опиши задачу</div>
              <div className="how-desc">Сформулируй цель, аудиторию и результат, который должен работать в реальной жизни.</div>
            </Reveal>
            <Reveal delay={0.12} className="how-item">
              <div className="how-step">02</div>
              <div className="how-icon-badge"><IconCreate size={32} /></div>
              <div className="how-title">Получи рабочий пакет</div>
              <div className="how-desc">OSGARD создаёт структуру, код, визуальные материалы и понятный план следующих шагов.</div>
            </Reveal>
            <Reveal delay={0.24} className="how-item">
              <div className="how-step">03</div>
              <div className="how-icon-badge"><IconLegend size={32} /></div>
              <div className="how-title">Развивай и применяй</div>
              <div className="how-desc">Запусти проект, дорабатывай его и превращай результат в полезный продукт для людей.</div>
            </Reveal>
          </div>
        </section>

        <section className="examples-section">
          <Reveal><h2>Наши проекты</h2></Reveal>
          <Reveal delay={0.05}><p className="examples-subtitle">Экосистема OSGARD: сервисы, продукты и команды, созданные для реального мира.</p></Reveal>
          <div className="examples-container">
            <Reveal delay={0} className="example-card">
              <a className="example-card-link" href="https://gardvpn.is" target="_blank" rel="noopener noreferrer" aria-label="GARDVPN.IS">
                <div className="example-preview example-preview-1"><Image src="/projects/vpn.jpg" alt="Серверная инфраструктура GARDVPN" fill sizes="(max-width: 600px) 100vw, 320px" /></div>
                <div className="example-body"><div className="example-icon-badge"><IconVPN size={26} /></div><div className="example-title">GARDVPN.IS</div><div className="example-desc">Приватный VPN-сервис для безопасного доступа и свободы в сети.</div></div>
                <ArrowRight className="example-link-arrow" size={18} aria-hidden="true" />
              </a>
            </Reveal>
            <Reveal delay={0.12} className="example-card">
              <a className="example-card-link" href="https://osgardos.com" target="_blank" rel="noopener noreferrer" aria-label="OSGARDOS.COM">
                <div className="example-preview example-preview-2"><Image src="/projects/os.jpg" alt="Технологическая система OSGARDOS" fill sizes="(max-width: 600px) 100vw, 320px" /></div><div className="example-body"><div className="example-icon-badge"><IconDashboard size={26} /></div><div className="example-title">OSGARDOS.COM</div><div className="example-desc">Операционная система и цифровая среда нового поколения.</div></div><ArrowRight className="example-link-arrow" size={18} aria-hidden="true" />
              </a>
            </Reveal>
            <Reveal delay={0.24} className="example-card">
              <a className="example-card-link" href="https://superday.run" target="_blank" rel="noopener noreferrer" aria-label="SUPERDAY.RUN">
                <div className="example-preview example-preview-3"><Image src="/projects/day.jpg" alt="Человек в движении для SUPERDAY" fill sizes="(max-width: 600px) 100vw, 320px" /></div><div className="example-body"><div className="example-icon-badge"><IconCreate size={26} /></div><div className="example-title">SUPERDAY.RUN</div><div className="example-desc">Приложение для ритма дня, действий и личного прогресса.</div></div><ArrowRight className="example-link-arrow" size={18} aria-hidden="true" />
              </a>
            </Reveal>
            <Reveal delay={0.36} className="example-card">
              <a className="example-card-link" href="https://osgardvanguard.studio" target="_blank" rel="noopener noreferrer" aria-label="OSGARDVANGUARD.STUDIO">
                <div className="example-preview example-preview-4"><Image src="/projects/studio.jpg" alt="Рабочее пространство OSGARDVANGUARD" fill sizes="(max-width: 600px) 100vw, 320px" /></div><div className="example-body"><div className="example-icon-badge"><IconLegend size={26} /></div><div className="example-title">OSGARDVANGUARD.STUDIO</div><div className="example-desc">Студия, где идеи превращаются в сильные цифровые продукты.</div></div><ArrowRight className="example-link-arrow" size={18} aria-hidden="true" />
              </a>
            </Reveal>
            <Reveal delay={0.48} className="example-card">
              <a className="example-card-link" href="https://senjorio.com" target="_blank" rel="noopener noreferrer" aria-label="SENJORIO.COM">
                <div className="example-preview example-preview-5"><Image src="/projects/taxi.jpg" alt="Городская поездка SENJORIO" fill sizes="(max-width: 600px) 100vw, 320px" /></div><div className="example-body"><div className="example-icon-badge"><IconTrade size={26} /></div><div className="example-title">SENJORIO.COM</div><div className="example-desc">Городская мобильность и такси с человеческим лицом.</div></div><ArrowRight className="example-link-arrow" size={18} aria-hidden="true" />
              </a>
            </Reveal>
          </div>
        </section>

        <section className="architects-section">
          <h2>{t("landing.architectsTitle")}</h2>
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
          <Reveal><h2>Как проект получает ценность</h2></Reveal>
          <Reveal delay={0.05} className="economy-vision">
            <p>TimeCoin — универсальная валюта экосистемы OSGARD. Артефакты получают ценность через качество, полезность и реальный спрос. Мы строим долгую историю доверия и масштаба — без обещаний гарантированной доходности.</p>
          </Reveal>
          <div className="values-container">
            <Reveal delay={0} className="value-item">
              <IconTrade size={32} />
              <div className="value-title">Понятное происхождение</div>
              <div className="value-desc">История создания, версия и вклад автора сохраняются вместе с каждым результатом.</div>
            </Reveal>
            <Reveal delay={0.12} className="value-item">
              <IconEarn size={32} />
              <div className="value-title">Практическая польза</div>
              <div className="value-desc">Проект можно запустить, показать команде, доработать и использовать в настоящем деле.</div>
            </Reveal>
            <Reveal delay={0.24} className="value-item">
              <IconInvest size={32} />
              <div className="value-title">Обмен внутри экосистемы</div>
              <div className="value-desc">TimeCoin помогает учитывать вклад и обмениваться результатами внутри OSGARD. Это не обещание доходности.</div>
            </Reveal>
          </div>
        </section>

        <section className="community-section">
          <Reveal className="community-inner">
            <IconCommunity size={40} />
            <h2>{t("landing.communityTitle")}</h2>
            <p className="community-desc">{t("landing.communityDesc")}</p>
            <Link href="/register" className="final-cta-btn">
              {t("landing.communityBtn")} <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </Link>
          </Reveal>
        </section>
      </div>

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
.eternity-page .site-nav-link-rustore {
  display: inline-flex; align-items: center; gap: 7px; padding: 8px 14px;
  color: #F4D675; border: 1px solid rgba(244, 214, 117, 0.42); border-radius: 30px;
  background: rgba(9, 12, 20, 0.58); transition: color 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}
.eternity-page .site-nav-link-rustore:hover {
  color: #FFF3BC; border-color: rgba(255, 215, 0, 0.8); background: rgba(212, 175, 55, 0.12);
}
@media (max-width: 600px) {
  .eternity-page .site-nav { padding: 16px 20px; }
  .eternity-page .site-nav-logo { font-size: 17px; }
  .eternity-page .site-nav-links { gap: 8px; }
  .eternity-page .site-nav-link-login { display: none; }
  .eternity-page .site-nav-link-rustore { padding: 8px 11px; }
  .eternity-page .site-nav-link-primary { padding: 8px 12px; }
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
.eternity-page .hero-pulse {
  width: 100%; max-width: 560px; margin-top: 4px;
  animation: eternity-rise 1s ease-out 0.55s forwards; opacity: 0;
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
.eternity-page .artifact-form button::after {
  content: "∞"; margin-left: 2px; font-family: var(--font-playfair), 'Playfair Display', serif;
  opacity: 0; transform: translateX(-4px); transition: opacity 0.3s ease, transform 0.3s ease;
}
.eternity-page .artifact-form button:hover {
  transform: scale(1.03); box-shadow: 0 0 30px rgba(255, 215, 0, 0.3);
}
.eternity-page .artifact-form button:hover::before { transform: translateX(120%); }
.eternity-page .artifact-form button:hover::after { opacity: 0.8; transform: translateX(0); }
.eternity-page .artifact-form button svg { stroke: #0A0D14; stroke-width: 2; position: relative; }


.eternity-page .hero-clarify {
  width: 100%; max-width: 560px; margin-top: -4px;
  font-size: 13px; font-weight: 400; color: #E8B84B; line-height: 1.5;
  letter-spacing: 0.01em; animation: eternity-rise 0.4s ease-out forwards;
}
.eternity-page .hero-clarify-received {
  color: #6B7A8C; font-style: italic;
}

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
  .eternity-page h1 { font-size: 48px; }
  .eternity-page .artifact-form { max-width: 100%; }
}
@media (max-width: 600px) {
  .eternity-page .container { padding-top: 128px; }
  .eternity-page h1 { font-size: 36px; }
  .eternity-page .artifact-form { flex-direction: column; gap: 10px; }
  .eternity-page .artifact-form input,
  .eternity-page .artifact-form button { width: 100%; height: 44px; }
}

.eternity-page .project-brief-overlay {
  position: fixed; inset: 0; z-index: 100;
  display: grid; place-items: center; padding: 24px;
  background: rgba(2, 4, 8, 0.78);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.eternity-page .project-brief-card {
  width: min(100%, 620px); max-height: calc(100dvh - 48px); overflow: auto;
  display: flex; flex-direction: column; gap: 14px; padding: 28px;
  background: #0a101b; border: 1px solid rgba(212, 175, 55, 0.28); border-radius: 12px;
  box-shadow: 0 32px 90px rgba(0, 0, 0, 0.58);
}
.eternity-page .project-brief-kicker { color: #f4d675; font-size: 12px; font-weight: 700; text-transform: uppercase; }
.eternity-page .project-brief-card h2 { margin: 0; font-family: var(--font-playfair), 'Playfair Display', serif; font-size: 30px; line-height: 1.12; }
.eternity-page .project-brief-card > p { margin: -4px 0 4px; color: #aebdd0; font-size: 14px; line-height: 1.55; }
.eternity-page .project-brief-progress { color: #f4d675; font-family: var(--font-space-grotesk), sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; margin: 8px 0 2px; }
.eternity-page .project-brief-card label { display: flex; flex-direction: column; gap: 7px; color: #e6edf8; font-size: 14px; font-weight: 600; }
.eternity-page .project-brief-card label span { color: #8190a5; font-size: 12px; font-weight: 400; }
.eternity-page .project-brief-card input, .eternity-page .project-brief-card textarea {
  width: 100%; border: 1px solid rgba(255,255,255,0.14); border-radius: 7px; padding: 11px 12px;
  background: rgba(255,255,255,0.04); color: #fff; font: inherit; font-weight: 400; outline: none; resize: vertical;
}
.eternity-page .project-brief-card input:focus, .eternity-page .project-brief-card textarea:focus { border-color: #f4d675; box-shadow: 0 0 0 3px rgba(244,214,117,0.1); }
.eternity-page .project-brief-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px; }
.eternity-page .project-brief-actions button { min-height: 42px; border-radius: 7px; padding: 9px 14px; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.eternity-page .project-brief-actions button:first-child { border: 1px solid rgba(255,255,255,0.16); background: transparent; color: #d4deea; }
.eternity-page .project-brief-actions button:last-child { display: inline-flex; align-items: center; gap: 7px; border: 0; background: #f4d675; color: #0a0d14; }
.eternity-page .project-brief-actions button:disabled { opacity: 0.42; cursor: not-allowed; }
@media (max-width: 600px) {
  .eternity-page .project-brief-overlay { align-items: end; padding: 10px; }
  .eternity-page .project-brief-card { max-height: calc(100dvh - 20px); padding: 22px 18px; border-radius: 10px; }
  .eternity-page .project-brief-card h2 { font-size: 25px; }
  .eternity-page .project-brief-actions { flex-direction: column-reverse; }
  .eternity-page .project-brief-actions button { width: 100%; justify-content: center; }
}

@media (prefers-reduced-motion: reduce) {
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
  font-family: var(--font-space), 'Playfair Display', serif; font-size: 32px; font-weight: 700;
  background: linear-gradient(150deg, var(--eg-gold-1), var(--eg-gold-3));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  letter-spacing: 0.06em; opacity: 0.85;
}
.eternity-page .how-title { font-size: 18px; font-weight: 600; color: #fff; letter-spacing: 0.5px; margin-top: 4px; }
.eternity-page .how-desc { font-size: 14px; color: #A0B0C8; line-height: 1.6; letter-spacing: 0.02em; }

.eternity-page .how-icon-badge,
.eternity-page .example-icon-badge {
  width: 64px; height: 64px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 30% 30%, rgba(212, 175, 55, 0.14), rgba(10, 13, 20, 0.92) 75%);
  border: 1px solid rgba(212, 175, 55, 0.3);
  box-shadow: inset 0 0 18px rgba(212, 175, 55, 0.12), 0 0 22px rgba(212, 175, 55, 0.1);
  transition: box-shadow 0.35s ease, transform 0.35s ease;
}
.eternity-page .how-item:hover .how-icon-badge,
.eternity-page .example-card:hover .example-icon-badge {
  box-shadow: inset 0 0 22px rgba(212, 175, 55, 0.2), 0 0 32px rgba(212, 175, 55, 0.22);
  transform: scale(1.06);
}

/* ─── «Примеры проектов» ─── */
.eternity-page .examples-subtitle {
  grid-column: 1/-1; text-align: center; color: #A0B0C8; font-size: 15px;
  letter-spacing: 0.02em; margin-top: -24px; margin-bottom: 40px;
  max-width: 560px; margin-left: auto; margin-right: auto;
}
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
.eternity-page .example-card-link { position: relative; display: block; height: 100%; color: inherit; text-decoration: none; }
.eternity-page .example-link-arrow { position: absolute; right: 22px; bottom: 22px; color: #D4AF37; opacity: 0.7; transition: transform 0.25s ease, opacity 0.25s ease; }
.eternity-page .example-card-link:hover .example-link-arrow { transform: translateX(4px); opacity: 1; }
.eternity-page .example-card-link:focus-visible { outline: 2px solid #D4AF37; outline-offset: -2px; border-radius: inherit; }
.eternity-page .economy-vision { max-width: 760px; margin: 16px auto 28px; padding: 18px 24px; border: 1px solid rgba(212,175,55,0.28); border-radius: 12px; background: linear-gradient(110deg, rgba(212,175,55,0.1), rgba(10,13,20,0.28)); color: #D8C98E; font-size: 15px; line-height: 1.65; letter-spacing: 0.02em; text-align: center; }
.eternity-page .example-preview { height: 140px; width: 100%; position: relative; overflow: hidden; }
.eternity-page .example-preview img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center; }
.eternity-page .example-preview::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(4,7,14,0.08), rgba(4,7,14,0.72)); }
.eternity-page .example-preview-1 { background: radial-gradient(circle at 30% 30%, rgba(212,175,55,0.35), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-2 { background: radial-gradient(circle at 70% 40%, rgba(106,90,205,0.35), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-3 { background: radial-gradient(circle at 50% 70%, rgba(45,125,210,0.3), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-4 { background: radial-gradient(circle at 35% 65%, rgba(46,204,113,0.28), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-preview-5 { background: radial-gradient(circle at 65% 35%, rgba(255,105,180,0.26), rgba(10,13,20,0.9) 70%); }
.eternity-page .example-body {
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
  padding: 24px;
}
.eternity-page .example-title { max-width: 100%; overflow-wrap: anywhere; font-size: 16px; font-weight: 600; color: #fff; letter-spacing: 0.5px; }
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
