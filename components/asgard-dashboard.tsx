"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { useAuth } from "@/lib/auth-store"
import Globe3D from "./globe-3d"
import ideaGrowthImg from "@/public/images/idea-growth.jpg"
import keyUprightImg from "@/public/key-upright.png"
import analyticsCleanImg from "@/public/images/analytics-clean.png"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  AlertTriangle,
  Activity,
  BarChart3,
  Bell,
  Brain,
  Thermometer,
  Boxes,
  Camera,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  Clock,
  Code2,
  Command,
  Cpu,
  Crown,
  Download,
  Folder,
  Gem,
  Globe,
  ImagePlus,
  Layers3,
  LineChart,
  Link2,
  LogIn,
  LogOut,
  MessageSquareText,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  TrendingUp,
  User,
  Sparkles,
  Swords,
  Terminal,
  Upload,
  Users,
  VolumeX,
  WandSparkles,
} from "lucide-react"
import { Area, AreaChart, ResponsiveContainer, XAxis } from "recharts"
import { DataTunnel } from "./data-tunnel"
import { MarketGrowthOverlay } from "./market-growth-overlay"

const navItems = [
  { label: "Workspace", icon: Boxes },
  { label: "Разработчик", icon: Terminal },
  { label: "Projects", icon: Layers3 },
  { label: "Community", icon: Users },
  { label: "Messages", icon: MessageSquareText, badge: "3" },
]

const analyticsData = [
  { month: "Jan", value: 32 },
  { month: "Feb", value: 41 },
  { month: "Mar", value: 38 },
  { month: "Apr", value: 55 },
  { month: "May", value: 61 },
  { month: "Jun", value: 74 },
  { month: "Jul", value: 92 },
]

const projects = [
  { name: "NOVA Commerce", type: "Next.js commerce", status: "Live", updated: "2m ago" },
  { name: "Flux Analytics", type: "Data dashboard", status: "Building", updated: "12m ago" },
  { name: "Arc Portfolio", type: "WebGL experience", status: "Draft", updated: "1h ago" },
]

// Neural pathway anchor points (% of stage) — must match node --x/--y positions
const neuralAnchors = [
  { id: "projects", x: 22, y: 22 },
  { id: "profile", x: 78, y: 22 },
  { id: "credits", x: 12, y: 50 },
  { id: "uptime", x: 88, y: 50 },
  { id: "connections", x: 26, y: 80 },
  { id: "analytics", x: 74, y: 80 },
]

const defaultAvatar = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

// Считает число вверх, когда элемент впервые попадает во вьюпорт (эффект useInView).
function CountUp({
  end,
  duration = 1400,
  decimals = 0,
  prefix = "",
  suffix = "",
  separator = "",
}: {
  end: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  separator?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return
        started.current = true
        const start = performance.now()
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1)
          // ease-out cubic для приятного замедления в конце
          const eased = 1 - Math.pow(1 - t, 3)
          setValue(end * eased)
          if (t < 1) requestAnimationFrame(tick)
          else setValue(end)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [end, duration])

  const formatted = value.toFixed(decimals)
  const withSeparators = separator
    ? formatted.replace(/\B(?=(\d{3})+(?!\d))/g, separator)
    : formatted

  return (
    <span ref={ref}>
      {prefix}
      {withSeparators}
      {suffix}
    </span>
  )
}

export function AsgardDashboard({ view = "landing" }: { view?: "landing" | "workspace" | "command" }) {
  const router = useRouter()
  const { logout } = useAuth()
  const currentScreen: "auth" | "dashboard" = view === "landing" ? "auth" : "dashboard"
  const [prompt, setPrompt] = useState("")
  const [mode, setMode] = useState("Auto")
  const [activeNav, setActiveNav] = useState(view === "command" ? "Разработчик" : "Workspace")
  const [avatar, setAvatar] = useState(defaultAvatar)
  const [profileOpen, setProfileOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [projectMenu, setProjectMenu] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Закрываем контекстное меню проекта при клике вне него.
  useEffect(() => {
    function closeMenu(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setProjectMenu(null)
    }
    document.addEventListener("pointerdown", closeMenu)
    return () => document.removeEventListener("pointerdown", closeMenu)
  }, [])

  function enterDashboard() {
    setProfileOpen(false)
    router.push("/workspace")
  }

  // Верхняя навигация: Workspace и Разработчик — отдельные маршруты.
  function handleNav(label: string) {
    if (label === "Workspace") router.push("/workspace")
    else if (label === "Разработчик") router.push("/command")
    else if (label === "Projects") router.push("/projects")
    else setActiveNav(label)
  }

  // Заглушка готова для замены на загрузку в облачное хранилище.
  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setAvatar(URL.createObjectURL(file))
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#040407] font-sans text-slate-100">
      <CosmicBackdrop />

      <div className="relative z-30 min-h-screen">
        {currentScreen === "auth" ? (
          <AuthScreen prompt={prompt} setPrompt={setPrompt} onEnter={enterDashboard} />
        ) : (
          <Dashboard
            prompt={prompt}
            setPrompt={setPrompt}
            mode={mode}
            setMode={setMode}
            activeNav={activeNav}
            onNav={handleNav}
            avatar={avatar}
            handleAvatarChange={handleAvatarChange}
            profileOpen={profileOpen}
            setProfileOpen={setProfileOpen}
            onLogout={logout}
            sidebarOpen={sidebarOpen}
            setSidebarOpen={setSidebarOpen}
            projectMenu={projectMenu}
            setProjectMenu={setProjectMenu}
            menuRef={menuRef}
          />
        )}
      </div>
    </main>
  )
}

function CosmicBackdrop() {
  return (
    <div className="fixed inset-0 overflow-hidden bg-[#040407]" aria-hidden="true">
      {/* Obsidian depth base */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 130% 100% at 50% -10%, #0a0d16 0%, #06070d 55%, #030306 100%)",
        }}
      />

      {/* Faint deep-teal nebula anchored on the far left */}
      <div
        className="absolute inset-y-0 left-0 w-3/5"
        style={{
          background:
            "radial-gradient(ellipse 55% 70% at 0% 46%, rgb(0 120 140 / 20%), rgb(0 90 120 / 6%) 45%, transparent 66%)",
        }}
      />

      {/* Neon plexus network texture — anchored right, screen-blended, edges faded */}
      <div
        className="absolute inset-y-0 right-0 w-2/3 opacity-[0.22] mix-blend-screen"
        style={{
          backgroundImage: "url(/images/neon-plexus.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center right",
          backgroundRepeat: "no-repeat",
          maskImage:
            "radial-gradient(ellipse 85% 90% at 100% 50%, #000 20%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 85% 90% at 100% 50%, #000 20%, transparent 78%)",
        }}
      />

      <div className="cosmic-vignette" />
    </div>
  )
}

function Brand() {
  return (
  <div className="flex items-center gap-3">
  <span className="brand-mark"><Command /></span>
  <span className="font-display text-xl font-semibold tracking-[0.24em] sm:text-2xl">OSGARD <span className="text-muted-foreground">Neural Platform</span></span>
  </div>
  )
  }

const hudItems = [
  { id: "level", label: "1", ariaLabel: "Уровень 1" },
  { id: "crown", icon: Crown, count: "0", ariaLabel: "Награды" },
  { id: "volume", icon: VolumeX, ariaLabel: "Звук выключен" },
  { id: "boost", icon: Sparkles, ariaLabel: "Ускорение" },
  { id: "shield", icon: Shield, ariaLabel: "Защита" },
  { id: "gem", icon: Gem, ariaLabel: "Кристаллы" },
  { id: "market", icon: LineChart, label: "Stock Market", ariaLabel: "Биржа" },
  { id: "battle", icon: Swords, ariaLabel: "Сражение" },
  { id: "inventory", icon: ClipboardList, ariaLabel: "Инвентарь" },
  { id: "back", icon: ArrowLeft, ariaLabel: "Назад" },
]

function GameIconBar() {
  const [selected, setSelected] = useState("level")

  return (
            <div className="mx-auto hidden max-w-full items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-[rgb(9_11_16)] px-2 py-1.5 xl:flex">
      {hudItems.map(({ id, icon: Icon, label, count, ariaLabel }) => {
        const active = selected === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setSelected(id)}
            aria-pressed={active}
            aria-label={ariaLabel}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-sm font-medium transition duration-200 hover:scale-105 ${
              active
                ? "border-primary/50 bg-primary/10 text-primary shadow-[0_0_16px_rgba(0,240,255,0.28)]"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            {Icon ? <Icon /> : <span className="grid size-5 place-items-center font-display text-xs font-bold">{label}</span>}
            {count && <span className="text-xs tabular-nums">{count}</span>}
            {label && !count && Icon && <span className="hidden whitespace-nowrap lg:inline">{label}</span>}
          </button>
        )
      })}
    </div>
  )
}

function AuthScreen({ prompt, setPrompt, onEnter }: { prompt: string; setPrompt: (value: string) => void; onEnter: () => void }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      {/* Deep-space starfield backdrop */}
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/images/starfield.png)" }}
        aria-hidden="true"
      />
      {/* Darkening + depth overlays for text legibility */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/80 via-black/55 to-black/85" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_38%,transparent,rgba(0,0,0,0.55))]" aria-hidden="true" />

      {/* Etched side nav elements */}
      <span className="vertical-text etched pointer-events-none absolute left-5 top-1/2 hidden -translate-y-1/2 text-[10px] font-semibold uppercase md:block">OSGARD Neural Core</span>
      <span className="vertical-text etched pointer-events-none absolute right-5 top-1/2 hidden -translate-y-1/2 text-[10px] font-semibold uppercase md:block">Neural workspace online</span>
      <button className="secondary-button etched-button absolute right-4 top-8 z-20 md:right-16" onClick={onEnter}><LogIn /> Войти</button>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center px-5 pt-16 text-center md:pt-24">
        <div className="eyebrow justify-center"><span className="status-dot" /> Neural workspace online</div>
        <h1 className="serif-title mt-6 max-w-4xl text-5xl font-semibold leading-[1.02] tracking-tight md:text-8xl">
          <span className="holo-title">Превратите идею</span>
          <br />
          <span className="holo-title">в </span>
          <span className="holo-accent">цифровой артефакт</span>
        </h1>

        {/* 3D dimensional card stage — input bar + three silver cards with the ornate key piercing through */}
        <div className="hero-stage relative mt-20 w-full max-w-5xl flex-col md:mt-28">
          {/* Wide input bar — immersive high-tech digital code portal */}
          <article className="silver-card mx-auto w-full">
            <div
              className="silver-inner flex items-center gap-3 p-2.5 md:gap-4 md:p-3"
              style={{ boxShadow: "inset 0 0 40px rgba(56,189,248,0.14), inset 0 1px 0 rgba(255,255,255,0.08)" }}
            >
              {/* Deep, immersive digital number/code stream behind the field */}
              <div
                className="animate-code-marquee pointer-events-none absolute inset-0 opacity-60"
                style={{ backgroundImage: "url(/code.jpg)", backgroundSize: "cover" }}
                aria-hidden="true"
              />
              {/* Rich high-tech data-stream gradient — dark blue/amber to black */}
              <div
                className="pointer-events-none absolute inset-0"
                style={{ background: "linear-gradient(100deg, rgba(8,20,38,0.92) 0%, rgba(20,16,10,0.6) 42%, rgba(4,6,12,0.9) 100%)" }}
                aria-hidden="true"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/55" aria-hidden="true" />

              {/* search glyph tile */}
              <span className="relative z-10 grid size-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/5 text-amber-100/90 md:size-14">
                <Search className="!size-5" />
              </span>

              <label htmlFor="auth-prompt" className="sr-only">Опишите артефакт</label>
              <input
                id="auth-prompt"
                value={prompt}
                maxLength={240}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.nativeEvent.isComposing || event.keyCode === 229) return
                  if (event.key === "Enter") onEnter()
                }}
                className="relative z-10 min-w-0 flex-1 bg-transparent text-base text-amber-100 outline-none placeholder:text-amber-200/70 md:text-lg"
                placeholder="Опишите артефакт..."
              />

              {/* Rounded СОЗДАТЬ submit button — premium glassmorphism pill */}
              <button
                onClick={onEnter}
                aria-label="Создать ар����ефакт"
                className="group relative z-10 inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-white/15 bg-[rgb(16_19_26)] px-5 font-display text-xs font-semibold uppercase tracking-[0.2em] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-all duration-300 hover:border-cyan-200/40 hover:bg-[rgb(22_26_34)] hover:text-white hover:shadow-[0_0_22px_rgba(34,211,238,0.22)] md:h-14 md:px-7 md:text-sm"
              >
                Создать
                <ArrowRight className="!size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
              </button>
            </div>
          </article>

          {/* 3-column grid — thick silver-bezel cards with high-fidelity assets */}
          <div className="hero-cards mt-5 grid w-full grid-cols-1 items-stretch gap-4 md:mt-6 md:grid-cols-3 md:gap-5">
            {/* Card 1 — 3D rotating Earth globe */}
            <article className="silver-card">
              <div className="silver-inner flex h-56 flex-col justify-end p-4">
                <div className="pointer-events-none absolute inset-x-0 top-2 flex items-center justify-center">
                  <div className="aspect-square w-40 rounded-full [box-shadow:0_0_80px_rgba(0,212,255,0.15)]">
                    <Globe3D />
                  </div>
                </div>
                <div className="relative text-center">
                  <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-slate-50 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">Проекты Создателей</p>
                </div>
              </div>
            </article>

            {/* Card 2 — CSS golden circuitry (the key pierces down into this card) */}
            <article className="silver-card">
              <div className="silver-inner flex h-56 flex-col justify-end p-4">
                <div className="relative text-center">
                  <p className="font-display text-sm font-bold uppercase tracking-[0.14em] text-amber-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">Получи ключ<br />и стань своим</p>
                </div>
              </div>
            </article>

            {/* Card 3 — cutout lamp (transparent bg) with Top-3 architects leaderboard beneath */}
            <article className="silver-card">
              <div className="flex h-56 flex-col items-start justify-start bg-transparent p-4 pl-2">
                {/* Enlarged lamp (pulsing glow) with a rising arrow overlay */}
                <div className="relative">
                  <Image
                    src={ideaGrowthImg}
                    alt="Glowing lightbulb rising above a growth chart"
                    className="lamp-flicker h-32 w-auto object-contain mix-blend-screen"
                    draggable={false}
                  />
                  <ArrowUp
                    className="arrow-rise absolute right-3 top-4 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.8)]"
                    size={26}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-1 font-display text-[13px] font-bold uppercase tracking-[0.12em] text-slate-50/60 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                  Топ 3 Архитектора Вселенной
                </p>
                <ol className="mt-2 w-full space-y-1.5 font-mono text-[11px] leading-none text-slate-300">
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-amber-300 shadow-[0_0_6px_rgba(252,211,77,0.9)]" aria-hidden="true" />
                    <span className="text-amber-300">01</span>
                    <span className="text-slate-500">{"//"}</span>
                    <span className="tracking-wide text-slate-100">GOLD_ARCHITECT</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-slate-300 shadow-[0_0_6px_rgba(203,213,225,0.9)]" aria-hidden="true" />
                    <span className="text-slate-300">02</span>
                    <span className="text-slate-500">{"//"}</span>
                    <span className="tracking-wide text-slate-100">MEDUSA_CODE</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-orange-500 shadow-[0_0_6px_rgba(249,115,22,0.9)]" aria-hidden="true" />
                    <span className="text-orange-400">03</span>
                    <span className="text-slate-500">{"//"}</span>
                    <span className="tracking-wide text-slate-100">ASSARDI_VALKYRIE</span>
                  </li>
                </ol>
              </div>
            </article>
          </div>

          {/* HUGE ornate golden key piercing the search bar into the center card */}
          <Image
            src={keyUprightImg}
            alt="Golden Key"
            className="pointer-events-none absolute left-1/2 top-[-16%] z-50 h-[102%] w-auto -translate-x-1/2 object-contain drop-shadow-[0_30px_60px_rgba(0,0,0,0.7)] drop-shadow-[0_0_50px_rgba(212,175,55,0.35)]"
          />

          {/* Photorealistic four-pointed star flare in the lower-right foreground */}
          <span className="star-flare pointer-events-none absolute -bottom-12 right-0 z-30 md:-bottom-16 md:-right-6" aria-hidden="true" />
        </div>
      </section>
    </div>
  )
}

function Dashboard({ prompt, setPrompt, mode, setMode, activeNav, onNav, avatar, handleAvatarChange, profileOpen, setProfileOpen, onLogout, sidebarOpen, setSidebarOpen, projectMenu, setProjectMenu, menuRef }: any) {
  return (
    <div className={`min-h-screen pt-20 ${activeNav === "Разработчик" ? "elite-chrome" : ""}`}>
      <header className="glass-header fixed inset-x-0 top-0 z-40 flex h-20 items-center gap-2 border-b px-4 md:gap-3 md:px-6">
        <Brand />
        <nav className="ml-1 flex items-center gap-1 md:ml-3" aria-label="Основная навигация">
          {navItems.map(({ label, icon: Icon, badge }) => {
            const active = activeNav === label
            return (
              <button key={label} type="button" onClick={() => onNav(label)} aria-pressed={active} title={label} className={`top-nav-item group ${active ? "active" : ""}`}>
                <Icon />
                <span className={`top-nav-label ${active ? "shown" : ""}`}>{label}</span>
                {badge && <span className="nav-badge">{badge}</span>}
              </button>
            )
          })}
        </nav>
        <GameIconBar />
        <div className="relative ml-auto flex items-center gap-2">
          <div className="credits-chip hidden lg:flex" title="7,240 из 10,000 токенов доступно">
            <Cpu className="size-4 text-primary" />
            <span className="meter w-14"><span style={{ width: "72%" }} /></span>
            <span className="text-xs font-semibold text-primary">72%</span>
          </div>
          <button className="icon-button" aria-label="Уведомления"><Bell /></button>
          <button className="profile-pill" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}>
            <Image src={avatar} alt="Alex Odin" width={36} height={36} className="size-9 rounded-full border border-primary/30 object-cover" />
            <span className="hidden text-sm font-medium sm:block">Alex Odin</span><ChevronDown className="hidden sm:block" />
          </button>
          {profileOpen && <div className="glass-panel absolute right-0 top-14 w-48 p-2"><button className="nav-item w-full" onClick={onLogout}><LogOut /> Выйти</button></div>}
        </div>
      </header>

      {activeNav === "Разработчик" ? (
        <DeveloperDashboard />
      ) : (
      <div className="mx-auto flex max-w-[1480px] flex-col gap-6 p-5 md:p-8">
        <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="eyebrow"><span className="status-dot" /> {activeNav} · online</div><h1 className="mt-3 font-display text-3xl font-semibold text-balance md:text-5xl">Добрый вечер, Alex.</h1><p className="mt-2 text-muted-foreground">Создайте следующий цифровой продукт вместе с OSGARD.</p></div>
          <div className="flex flex-wrap gap-2"><button className="secondary-button border-primary/30"><Download /> Import project</button><button className="primary-button bg-primary"><Plus /> New project</button></div>
        </section>

        {/* NEURAL INPUT ��� compact, borderless, with a live 3D flying-code canvas */}
        <section className="mx-auto w-full max-w-2xl">
          <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">Neural Input</p>
          <div className="relative overflow-hidden rounded-2xl shadow-[0_0_44px_-14px_rgba(34,211,238,0.45)] ring-1 ring-white/5">
            {/* Flying-code 3D canvas background */}
            <DataTunnel />
            {/* Dark gradient overlay keeps text sharp over the moving code */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-black/60" aria-hidden="true" />

            {/* Foreground */}
            <div className="relative z-10 flex flex-col gap-2.5 p-3">
              {/* Borderless rounded input */}
              <div className="flex items-center gap-2.5 rounded-xl bg-[rgb(14_16_22)] px-3.5 py-2.5">
                <Search className="size-4 shrink-0 text-cyan-300 drop-shadow-[0_0_6px_rgba(34,211,238,0.7)]" />
                <label htmlFor="neural-input" className="sr-only">Опишите артефакт</label>
                <input
                  id="neural-input"
                  type="text"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value.slice(0, 500))}
                  maxLength={500}
                  placeholder="Опишите артефакт..."
                  className="w-full border-none bg-transparent text-sm text-white outline-none focus:outline-none focus:ring-0 placeholder:text-slate-300/80"
                />
              </div>

              {/* Control row: mini square accents + shrunk teal Create button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {[
                    { Icon: Code2, label: "Вставить фрагме��т" },
                    { Icon: Boxes, label: "Шаблоны" },
                    { Icon: Gem, label: "Улучшить" },
                  ].map(({ Icon, label }) => (
                    <button
                      key={label}
                      type="button"
                      aria-label={label}
                      className="grid size-8 place-items-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition-colors duration-200 hover:border-cyan-400/40 hover:text-cyan-300"
                    >
                      <Icon className="size-3.5" />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold transition-[border-color,background] duration-300"
                  style={{ background: "rgba(0,240,255,0.08)", border: "1px solid rgba(0,240,255,0.4)", color: "#00f0ff" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(0,240,255,0.15)"; e.currentTarget.style.borderColor = "rgba(0,240,255,0.65)" }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,240,255,0.08)"; e.currentTarget.style.borderColor = "rgba(0,240,255,0.4)" }}
                >
                  Создать <ArrowUp className="size-3" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <NeuralCore avatar={avatar} handleAvatarChange={handleAvatarChange} projects={projects} projectMenu={projectMenu} setProjectMenu={setProjectMenu} menuRef={menuRef} />
      </div>
      )}
    </div>
  )
}

function ProfileHudAvatar() {
  const bars = [
    { label: "SYNC", pct: 94 },
    { label: "CORE", pct: 80 },
    { label: "NET", pct: 67 },
    { label: "SYS", pct: 45 },
  ]
  const r = 42
  const C = 2 * Math.PI * r
  const gap = 14
  const seg = C / 4 - gap // 4 evenly spaced ring segments
  const ticks = Array.from({ length: 48 })

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Adjacent mini horizontal telemetry meters */}
      <div className="flex w-11 flex-col gap-1.5" aria-hidden="true">
        {bars.map(({ label, pct }) => (
          <div key={label}>
            <span className="block font-mono text-[7px] font-semibold uppercase tracking-[0.16em] text-cyan-300/70">{label}</span>
            <div className="mt-0.5 h-[3px] w-full overflow-hidden rounded-full bg-cyan-500/10">
              <div className="h-full rounded-full bg-cyan-400 shadow-[0_0_8px_#0ea5e9]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* Circular holographic gauge */}
      <div className="relative grid size-20 shrink-0 place-items-center">
        <svg viewBox="0 0 100 100" className="!size-full -rotate-90">
          {/* outer dotted reference circle */}
          <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(103,232,249,0.35)" strokeWidth="0.6" strokeDasharray="1 3" />
          {/* thick segmented arc ring — cyan blocks */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="#0ea5e9" strokeWidth="3.5" strokeDasharray={`${seg} ${gap}`} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 3px #0ea5e9)" }} />
          {/* one bright highlighted segment */}
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(224,242,254,0.95)" strokeWidth="3.5" strokeDasharray={`${seg} ${C - seg}`} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px rgba(224,242,254,0.8))" }} />
          {/* peripheral tick scale */}
          {ticks.map((_, i) => {
            const a = (i / ticks.length) * Math.PI * 2
            const long = i % 4 === 0
            const inner = long ? 32 : 34
            const round = (n: number) => Math.round(n * 1000) / 1000
            return <line key={i} x1={round(50 + Math.cos(a) * 36)} y1={round(50 + Math.sin(a) * 36)} x2={round(50 + Math.cos(a) * inner)} y2={round(50 + Math.sin(a) * inner)} stroke="rgba(103,232,249,0.5)" strokeWidth={long ? 0.7 : 0.4} />
          })}
        </svg>

        {/* inner glass sphere */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 size-[56%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-500/30 bg-cyan-950/70" aria-hidden="true" />

        {/* gauge core readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span className="font-display text-lg font-bold tracking-tight text-cyan-50 drop-shadow-[0_0_6px_rgba(14,165,233,0.7)]">94%</span>
          <span className="mt-1 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-1.5 py-px font-mono text-[7px] font-bold tracking-wider text-cyan-200">12/12</span>
        </div>

        {/* framing corner brackets */}
        <span className="pointer-events-none absolute left-0 top-0 size-2.5 border-l border-t border-cyan-400/50" aria-hidden="true" />
        <span className="pointer-events-none absolute right-0 top-0 size-2.5 border-r border-t border-cyan-400/50" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-0 left-0 size-2.5 border-b border-l border-cyan-400/50" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-0 right-0 size-2.5 border-b border-r border-cyan-400/50" aria-hidden="true" />
      </div>
    </div>
  )
}

function NeuralCore({ avatar, handleAvatarChange, projects, projectMenu, setProjectMenu, menuRef }: any) {
  const stageRef = useRef<HTMLElement>(null)
  const globeOrbitRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<Record<string, SVGLineElement | null>>({})

  const nodeProps = (id: string) => {
    const a = neuralAnchors.find((n) => n.id === id)!
    return { style: { "--x": `${a.x}%`, "--y": `${a.y}%` } as React.CSSProperties, "data-anchor": id }
  }

  // Real-time orbit + connector tracking (requestAnimationFrame, 60fps).
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const desktop = window.matchMedia("(min-width: 1280px)")
    const start = performance.now()
    const PERIOD = 78000 // ms per full revolution (~78s, within 60-90s spec)
    const RADIUS_X = 128
    const RADIUS_Y = 94
    let raf = 0

    const tick = (now: number) => {
      const rect = stage.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      let ox = 0
      let oy = 0
      if (desktop.matches) {
        const ang = ((now - start) / PERIOD) * Math.PI * 2
        ox = Math.cos(ang) * RADIUS_X
        oy = Math.sin(ang) * RADIUS_Y
      }
      const gx = cx + ox
      const gy = cy + oy
      if (globeOrbitRef.current) {
        globeOrbitRef.current.style.transform = `translate(${ox}px, ${oy}px)`
      }
      if (desktop.matches) {
        for (const a of neuralAnchors) {
          const line = lineRefs.current[a.id]
          const el = stage.querySelector<HTMLElement>(`[data-anchor="${a.id}"]`)
          if (!line || !el) continue
          const r = el.getBoundingClientRect()
          const nx = r.left - rect.left + r.width / 2
          const ny = r.top - rect.top + r.height / 2
          const ux = gx - nx
          const uy = gy - ny
          // End the line 15px outside each window box (never touching it)
          const hw = r.width / 2 + 15
          const hh = r.height / 2 + 15
          const tX = Math.abs(ux) > 1e-3 ? hw / Math.abs(ux) : Infinity
          const tY = Math.abs(uy) > 1e-3 ? hh / Math.abs(uy) : Infinity
          const t = Math.min(tX, tY, 1)
          line.setAttribute("x1", String(gx))
          line.setAttribute("y1", String(gy))
          line.setAttribute("x2", String(nx + ux * t))
          line.setAttribute("y2", String(ny + uy * t))
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <section ref={stageRef} className="neural-stage" aria-label="Digital Nervous System">
      {/* Connector pathways — follow the orbiting globe in real time, ending 15px before each window */}
      <svg className="neural-lines" preserveAspectRatio="none" aria-hidden="true">
        {neuralAnchors.map((a) => (
          <line
            key={a.id}
            ref={(el) => {
              lineRefs.current[a.id] = el
            }}
            className="neural-line"
            stroke="#4A8AB5"
          />
        ))}
      </svg>

      {/* Central 3D Earth core — frameless, transparent, orbiting via rAF */}
      <div className="neural-core">
        <div
          ref={globeOrbitRef}
          className="relative grid size-[300px] place-items-center overflow-visible will-change-transform xl:size-[400px]"
        >
          {/* the rotating 3D globe */}
          <div className="relative z-10 size-[230px] xl:size-[260px]">
            <Globe3D />
          </div>
        </div>
      </div>

      {/* Projects */}
      <div className="neural-node overflow-visible" {...nodeProps("projects")}>
        <div className="mb-3 flex items-center justify-between"><h3 className="neural-node-title font-display text-sm font-semibold uppercase tracking-wide">Мои проекты</h3><Layers3 className="size-4 text-sky-400" /></div>
        <div className="flex flex-col gap-2">
          {["аналитика похожих проектов", "портфель акций"].map((label) => (
            <div key={label} className="flex items-center gap-3 rounded-lg px-1 py-1.5 text-left">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-sky-400/25 bg-sky-400/10 text-sky-300"><Code2 className="size-4" /></span>
              <p className="min-w-0 flex-1 truncate text-sm text-slate-200">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Profile with holographic brain */}
      <div className="neural-node flex flex-col gap-4" {...nodeProps("profile")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><h3 className="neural-node-title font-display text-sm font-semibold">Creator Profile</h3></div>
          <span className="flex items-center gap-1.5 text-[10px] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" /> Online</span>
        </div>

        {/* HUD: status bars + 94% dial beside identity */}
        <div className="flex items-center gap-3">
          <ProfileHudAvatar />
          <input id="avatar-upload" type="file" accept="image/*" className="sr-only" onChange={handleAvatarChange} />
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold text-white">Alex Odin</p>
            <p className="whitespace-nowrap font-mono text-xs text-slate-400">Architect • Lvl. 12</p>
            <label htmlFor="avatar-upload" className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"><Upload className="size-3" /> Update</label>
          </div>
        </div>

        {/* Telemetry grid — Uptime / Synergy / Visual Density / Connections */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Uptime", value: "24d", Icon: Clock, accent: "sky", text: "text-sky-300", border: "border-sky-400/30", bg: "bg-sky-400/[0.07]", label2: "text-sky-300/80", icon: "text-sky-400" },
            { label: "Synergy", value: "94%", Icon: Activity, text: "text-emerald-300", border: "border-emerald-400/30", bg: "bg-emerald-400/[0.07]", label2: "text-emerald-300/80", icon: "text-emerald-400" },
            { label: "Visual Density", value: "Quantum", Icon: Gem, text: "text-amber-200", border: "border-amber-400/30", bg: "bg-amber-400/[0.06]", label2: "text-amber-300/80", icon: "text-amber-400" },
            { label: "Connections", value: "12", Icon: Users, text: "text-violet-200", border: "border-violet-400/30", bg: "bg-violet-400/[0.08]", label2: "text-violet-300/80", icon: "text-violet-400" },
          ].map(({ label, value, Icon, text, border, bg, label2, icon }) => (
            <div key={label} className={`rounded-lg border ${border} ${bg} p-3`}>
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-[11px] uppercase tracking-widest ${label2}`}>{label}</span>
                <Icon className={`size-3.5 ${icon}`} />
              </div>
              <p className={`font-display text-lg font-bold ${text}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Neural credits */}
      <div className="neural-node" {...nodeProps("credits")}>
        <div className="flex items-center gap-3">
          <CircularDial value={78} max={100} size={52} color="#22d3ee" track="rgba(34,211,238,0.14)">
            <span className="font-display text-[11px] font-bold text-cyan-200"><CountUp end={78} suffix="%" /></span>
          </CircularDial>
          <div className="min-w-0">
            <h3 className="neural-node-title font-display text-sm font-semibold">Neural credits</h3>
            <p className="mt-1 text-[13px] leading-snug">
              <span className="font-display font-semibold text-white"><CountUp end={7340} separator=" " /></span>
              <span className="text-slate-400"> из </span>
              <span className="font-display font-semibold text-white">10.0.1700</span>
              <span className="text-slate-400"> токенов доступно</span>
            </p>
          </div>
        </div>
      </div>

      {/* System status — minimal, header only */}
      <div className="neural-node" {...nodeProps("uptime")}>
        <div className="mb-2 flex items-center justify-between"><h3 className="neural-node-title font-display text-sm font-semibold">System status</h3><Shield className="size-4 text-sky-400" /></div>
        <p className="font-display text-xl font-bold text-emerald-300"><CountUp end={99.9} decimals={1} suffix="%" /></p>
        <p className="text-[11px] text-slate-400">Uptime · All systems operational</p>
      </div>

      {/* Active connections */}
      <div className="neural-node" {...nodeProps("connections")}>
        <div className="mb-2 flex items-center justify-between"><h3 className="neural-node-title font-display text-sm font-semibold">Connection</h3><Users className="size-4 text-sky-400" /></div>
        <p className="font-display text-xl font-bold text-white"><CountUp end={98} /></p>
        <p className="text-[11px] text-slate-400">Active neural links</p>
      </div>

      {/* Analytics — cyan upward trend line */}
      <div className="neural-node" {...nodeProps("analytics")}>
        <div className="mb-2 flex items-center justify-between"><h3 className="neural-node-title font-display text-sm font-semibold">Analytics</h3><span className="flex items-center gap-0.5 font-display text-sm font-bold text-emerald-300"><ArrowUp className="size-3.5" />+18%</span></div>
        <div className="h-16 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analyticsData} margin={{ top: 6, right: 2, left: 2, bottom: 0 }}>
              <defs>
                <linearGradient id="neuralArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="#22d3ee" strokeWidth={2} fill="url(#neuralArea)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom-right spark icons */}
      <div className="pointer-events-none absolute bottom-6 right-6 z-10 hidden items-end gap-2 xl:flex" aria-hidden="true">
        <Sparkles className="size-6 text-slate-300 drop-shadow-[0_0_10px_rgba(148,163,184,0.5)]" />
        <Sparkles className="size-4 text-slate-400/80 drop-shadow-[0_0_8px_rgba(148,163,184,0.4)]" />
      </div>
    </section>
  )
}

function CircularDial({ value, max, size = 96, color = "#d4af37", track = "rgba(212,175,55,0.14)", children }: { value: number; max: number; size?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const pct = Math.min(1, value / max)
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">{children}</div>
    </div>
  )
}

function ProjectLifespanWidget() {
  return (
    <div className="hud-widget flex items-center justify-between gap-3 p-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/80">Project</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500"><Clock className="size-3 text-amber-400" /> Active development</p>
      </div>
      <div className="text-right">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-slate-500">Lifespad</p>
        <p className="mt-1 font-display text-xl font-bold text-slate-100"><CountUp end={284} duration={1600} /><span className="ml-1 text-[11px] font-normal text-slate-400">days</span></p>
        <p className="text-[10px] font-semibold text-amber-200">78% / year</p>
      </div>
    </div>
  )
}

function UserMatrixWidget() {
  return (
    <div className="hud-widget p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-cyan-300/80">User Matrix</p>
        <Users className="size-3.5 text-cyan-400" />
      </div>
      <p className="mt-2 font-display text-3xl font-bold tabular-nums text-slate-100"><CountUp end={1289} separator="," duration={1600} /></p>
      <p className="text-[11px] text-slate-500">Active nodes / users</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {["ONLINE", "SECURE", "SYNCED"].map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1 rounded-full border border-cyan-500/25 bg-cyan-950/30 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-300">
            <span className="hud-blink size-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.9)]" style={{ animationDelay: `${i * 0.4}s` }} /> {s}
          </span>
        ))}
      </div>
    </div>
  )
}

function AtmosphereWidget() {
  const rows = [
    { label: "Core Time", value: "34°C", note: "Stable", pct: 34, color: "#22d3ee", icon: Thermometer, warn: false },
    { label: "A.I. Synergy", value: "94%", note: "Optimal", pct: 94, color: "#34d399", icon: Activity, warn: false },
    { label: "Visual Density", value: "Quantum", note: "Max", pct: 100, color: "#d4af37", icon: Gem, warn: true },
  ]
  return (
    <div className="hud-widget p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-amber-300/80">Environment Atmosphere</p>
      <div className="mt-3 flex flex-col gap-3">
        {rows.map(({ label, value, note, pct, color, icon: Icon, warn }) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400"><Icon className="size-3" style={{ color }} /> {label}</span>
              <span className="flex items-center gap-1 font-semibold" style={{ color }}>{warn && <AlertTriangle className="size-3 text-amber-400" />}{value}<span className="text-slate-600">· {note}</span></span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenerationMatrixWidget() {
  const items = [
    { label: "WEBAPP", pct: 64, color: "#d4af37" },
    { label: "NEURALINE", pct: 24, color: "#22d3ee" },
    { label: "API-MESH", pct: 12, color: "#a855f7" },
  ]
  return (
    <div className="hud-widget p-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-slate-300/80">Generation Ratrix</p>
        <Boxes className="size-3.5 text-slate-400" />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {items.map(({ label, pct, color }) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between text-[11px] font-semibold">
              <span className="tracking-wider text-slate-300">{label}</span>
              <span style={{ color }}>{pct}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DeveloperDashboard() {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = frameRef.current
    const img = imgRef.current
    if (!el || !img) return
    const r = el.getBoundingClientRect()
    // -1..1 relative to center
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    const rotX = (-py * 6).toFixed(2)
    const rotY = (px * 8).toFixed(2)
    const transX = (-px * 18).toFixed(1)
    const transY = (-py * 18).toFixed(1)
    img.style.transform = `scale(1.12) translate(${transX}px, ${transY}px) rotateX(${rotX}deg) rotateY(${rotY}deg)`
  }

  const handleLeave = () => {
    const img = imgRef.current
    if (img) img.style.transform = "scale(1.05) translate(0px, 0px) rotateX(0deg) rotateY(0deg)"
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      {/* Console window — 60% x 70%, centered, transparent, 1px #2A2A3E border, 8px radius */}
      <div
        ref={frameRef}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="group relative flex h-[70vh] w-[60vw] min-w-[320px] flex-col overflow-hidden"
        style={{ background: "transparent", border: "1px solid #2A2A3E", borderRadius: 8, perspective: "1200px" }}
      >
        {/* Interactive full-bleed photo */}
        <Image
          ref={imgRef}
          src={analyticsCleanImg}
          alt="3D analytics dashboard with rising charts"
          fill
          sizes="60vw"
          className="pointer-events-none z-0 object-cover transition-transform duration-300 ease-out will-change-transform"
          style={{ transform: "scale(1.05)" }}
          draggable={false}
        />
        {/* legibility scrims: top + bottom */}
        <div className="pointer-events-none absolute inset-0 z-10" style={{ background: "linear-gradient(180deg, rgba(10,14,39,0.72) 0%, rgba(10,14,39,0.05) 22%, rgba(10,14,39,0.05) 62%, rgba(10,14,39,0.92) 100%)" }} aria-hidden="true" />

        {/* Interactive: clickable buttons on the screen that reveal a market growth chart */}
        <MarketGrowthOverlay />

        <div className="relative z-20 p-6 text-center md:p-8">
          <h2
            className="font-display text-[14px] font-semibold uppercase tracking-[0.22em]"
            style={{ color: "#8FC2E0" }}
          >
            OSGARD Neural Core
          </h2>
          <p className="mt-1 font-mono text-[11px] tracking-wide text-white opacity-60">
            Tactical demand center - neural interface line
          </p>
        </div>

        <div className="flex-1" />

        {/* 3-column data readout — premium thin monochrome icons */}
        <div className="relative z-20 grid grid-cols-3 gap-4 border-t p-6 pt-4 md:px-8" style={{ borderColor: "rgba(26,42,74,0.8)" }}>
          {/* PROJECT */}
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "#6A6A8A" }}>
              <Folder size={14} strokeWidth={1.5} className="opacity-50" />
              Project
            </p>
            <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-300">
              <Clock size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="opacity-50" />
              284 days
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500">
              <TrendingUp size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="opacity-50" />
              78% / year
            </p>
          </div>
          {/* USER MATRIX */}
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "#6A6A8A" }}>
              <Users size={14} strokeWidth={1.5} className="opacity-50" />
              User Matrix
            </p>
            <p className="mt-2 flex items-center gap-2 font-mono text-[11px] text-slate-300">
              <User size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="opacity-50" />
              1,289
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500">
              <Circle size={9} strokeWidth={1.5} fill="#6A6A8A" style={{ color: "#6A6A8A" }} className="opacity-60" />
              ONLINE
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500">
              <Shield size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="opacity-50" />
              SECURE
            </p>
            <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-slate-500">
              <RefreshCw size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="opacity-50" />
              SYNCED
            </p>
          </div>
          {/* GENERATION RATRIX */}
          <div>
            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em]" style={{ color: "#6A6A8A" }}>
              <BarChart3 size={14} strokeWidth={1.5} className="opacity-50" />
              Generation Ratrix
            </p>
            <div className="mt-2 space-y-1 font-mono text-[11px] text-slate-400">
              <p className="flex items-center gap-2">
                <Globe size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="shrink-0 opacity-50" />
                <span className="flex-1">WEBAPP</span>
                <span className="text-slate-200">64%</span>
              </p>
              <p className="flex items-center gap-2">
                <Brain size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="shrink-0 opacity-50" />
                <span className="flex-1">NEURALINE</span>
                <span className="text-slate-200">24%</span>
              </p>
              <p className="flex items-center gap-2">
                <Link2 size={14} strokeWidth={1.5} style={{ color: "#6A6A8A" }} className="shrink-0 opacity-50" />
                <span className="flex-1">API-MESH</span>
                <span className="text-slate-200">12%</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
