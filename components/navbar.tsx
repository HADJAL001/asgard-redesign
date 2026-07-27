"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Home,
  FolderKanban,
  Wand2,
  Activity,
  Beer,
  Hammer,
  ShoppingBag,
  TrendingUp,
  MessageCircle,
  Bell,
  Mail,
  Lock,
  BarChart3,
  Users,
  Sparkle,
  ShieldCheck,
  LogOut,
  UserRound,
  BookOpen,
  Map,
  GitBranch,
  CreditCard,
  KeyRound,
  Plug,
  Menu,
  HelpCircle,
  Gem,
  GraduationCap,
  BadgeCheck,
  X,
  type LucideIcon,
} from "lucide-react"

import { useOsgard } from "@/lib/store/osgard-store"
import { useNotificationsStore, useNotificationStream } from "@/lib/store/notifications-store"
import { useAuth } from "@/lib/auth-store"
import { CURRENCIES, CURRENCY_ORDER, formatCurrencyAmount } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { LOCALES, LOCALE_SHORT, LOCALE_LABELS, type Locale } from "@/lib/i18n"
import { useAdaptiveLabel } from "@/lib/use-adaptive-label"
import { useState, useRef, useEffect } from "react"
import { Globe } from "lucide-react"


/* ---- Palette ----
   panel #0A0A0F · accent #D4AF37 · text #FFFFFF · icon/label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

export type NavItem = { key: string; href: string; Icon: LucideIcon }

export const NAV: NavItem[] = [
  { key: "nav.home", href: "/", Icon: Home },
  { key: "nav.projects", href: "/projects", Icon: FolderKanban },
  { key: "nav.refinements", href: "/refinements", Icon: Wand2 },
  { key: "nav.orchestrator", href: "/orchestrator", Icon: GitBranch },
  { key: "nav.integrations", href: "/integrations", Icon: Plug },
  { key: "nav.community", href: "/community", Icon: Beer },
  { key: "nav.feed", href: "/feed", Icon: Activity },
  { key: "nav.forge", href: "/forge", Icon: Hammer },
  { key: "nav.marketplace", href: "/marketplace", Icon: ShoppingBag },
  { key: "nav.exchange", href: "/exchange", Icon: TrendingUp },
  { key: "nav.stake", href: "/stake", Icon: Lock },
  { key: "nav.twin", href: "/twin", Icon: Sparkle },
  { key: "nav.economy", href: "/economy", Icon: BarChart3 },
  { key: "nav.vault", href: "/vault", Icon: Gem },
  { key: "nav.referral", href: "/referral", Icon: Users },
  { key: "nav.messages", href: "/messages", Icon: MessageCircle },
  { key: "nav.docs", href: "/docs", Icon: BookOpen },
  { key: "nav.economyMap", href: "/docs/economy-map", Icon: Map },
  { key: "nav.pricing", href: "/pricing", Icon: CreditCard },
  { key: "nav.academy", href: "/academy", Icon: GraduationCap },
  { key: "nav.certified", href: "/certified", Icon: BadgeCheck },
  { key: "nav.developer", href: "/developer", Icon: KeyRound },
  { key: "nav.room", href: "/room", Icon: Lock },
  { key: "nav.about", href: "/about", Icon: HelpCircle },
]

/** Разделы, которые остаются в основной строке шапки — остальное уходит в боковое меню.
 *  По прямому указанию пользователя (2026-07-26) шапка отдана РАБОЧЕМУ контуру:
 *  Проекты · Доработки · Оркестратор (то, чем человек создаёт и дорабатывает
 *  приложение). Кузница и Маркет — экономический контур — переехали в боковое
 *  меню: оттуда они по-прежнему в один клик, но не спорят за первое место с
 *  главным сценарием платформы. Порядок берётся из NAV (см. фильтр ниже). */
const CORE_NAV_KEYS = ["nav.home", "nav.projects", "nav.refinements", "nav.orchestrator"]

/** Переключатель языка · выпадающий список RU / EN / KZ */
function LanguageSwitcher() {
  const { locale, setLocale, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("nav.language")}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-white/5"
        style={{ color: "#6A6A8A", border: "1px solid #2A2A3E" }}
      >
        <Globe size={14} strokeWidth={1.75} aria-hidden="true" />
        {LOCALE_SHORT[locale]}
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-50 mt-2 min-w-[140px] overflow-hidden rounded-lg"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              type="button"
              role="option"
              aria-selected={locale === l}
              onClick={() => {
                setLocale(l)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] transition-colors hover:bg-white/5"
              style={{ color: locale === l ? "var(--color-gold)" : "rgba(255,255,255,0.8)" }}
            >
              {LOCALE_LABELS[l]}
              <span style={{ color: "#6A6A8A" }}>{LOCALE_SHORT[l]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


/** Профиль · выпадающее меню с переходом в профиль и реальным выходом из аккаунта */
function ProfileMenu({
  isAuthenticated,
  displayName,
  avatarUrl,
  isProfileActive,
  onLogout,
}: {
  isAuthenticated: boolean
  displayName: string
  avatarUrl: string
  isProfileActive: boolean
  onLogout: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  if (!isAuthenticated) {
    return (
      <Link href="/login" className="flex items-center gap-2 transition-opacity hover:opacity-90">
        <Image
          src={avatarUrl || "/placeholder.svg"}
          alt={t("nav.guest")}
          width={32}
          height={32}
          className="size-8 rounded-full object-cover"
          style={{ border: "1px solid #2A2A3E" }}
        />
        <span className="hidden text-[14px] xl:block" style={{ color: "rgba(255,255,255,0.8)" }}>
          {t("nav.guest")}
        </span>
      </Link>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 transition-opacity hover:opacity-90"
      >
        <Image
          src={avatarUrl || "/placeholder.svg"}
          alt={displayName}
          width={32}
          height={32}
          className="size-8 rounded-full object-cover"
          style={{ border: `1px solid ${isProfileActive || open ? "var(--color-gold)" : "#2A2A3E"}` }}
        />
        <span
          className="hidden text-[14px] xl:block"
          style={{ color: isProfileActive || open ? "var(--color-gold)" : "rgba(255,255,255,0.8)" }}
        >
          {displayName}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-lg"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          <Link
            href="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.8)" }}
          >
            <UserRound size={15} strokeWidth={1.75} />
            {t("nav.profile")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onLogout()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-white/5"
            style={{ color: "#FF6B6B", borderTop: "1px solid #2A2A3E" }}
          >
            <LogOut size={15} strokeWidth={1.75} />
            {t("nav.logout")}
          </button>
        </div>
      )}
    </div>
  )
}

/** Боковое меню · все разделы, гамбургер на мобильных, «Ещё» на десктопе */
function NavDrawer({
  items,
  isActive,
  open,
  onClose,
}: {
  items: NavItem[]
  isActive: (href: string) => boolean
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.mainNav")}
        className="fixed right-0 top-0 z-50 flex h-full w-[280px] max-w-[85vw] flex-col transition-transform duration-200"
        style={{
          backgroundColor: "#0A0A0F",
          borderLeft: "1px solid #2A2A3E",
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5" style={{ borderBottom: "1px solid #2A2A3E" }}>
          <span
            className="text-[13px] font-semibold tracking-[0.18em]"
            style={{ color: "var(--color-gold)" }}
          >
            {t("nav.menuTitle")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("nav.close")}
            className="rounded-full p-1.5 transition-colors hover:bg-white/5"
            style={{ color: "#6A6A8A" }}
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {items.map(({ key, href, Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={key}
                href={href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-normal transition-colors hover:bg-white/5"
                style={{ color: active ? "var(--color-gold)" : "rgba(255,255,255,0.75)" }}
              >
                <Icon
                  size={17}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  style={{ color: active ? "var(--color-gold)" : "#6A6A8A" }}
                />
                {t(key)}
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium leading-none"
      style={{ backgroundColor: "var(--color-gold)", color: "#0A0A0F" }}
    >
      {count}
    </span>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const { wallet } = useOsgard()
  const { t } = useTranslation()
  const { user, isAuthenticated, logout } = useAuth()
  const { unreadCount, fetchUnreadCount } = useNotificationsStore()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const showNotificationsLabel = useAdaptiveLabel("nav-notifications")
  const showMessagesLabel = useAdaptiveLabel("nav-messages")

  // Real-time push уведомлений (SSE). Опрос ниже остаётся резервом на случай обрыва потока.
  useNotificationStream(isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return
    fetchUnreadCount({ skipAuthRedirect: true })
    const id = setInterval(() => fetchUnreadCount({ skipAuthRedirect: true }), 60_000)
    return () => clearInterval(id)
  }, [isAuthenticated, fetchUnreadCount])

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")

  const navItems = user?.role === "admin" ? [...NAV, { key: "nav.admin", href: "/admin", Icon: ShieldCheck }] : NAV
  const coreItems = navItems.filter((item) => CORE_NAV_KEYS.includes(item.key))

  return (
    <div className="sticky top-0 z-40 font-sans">
      <header
        className="flex h-16 items-center"
        style={{ backgroundColor: "#0A0A0F", borderBottom: "1px solid #2A2A3E", color: "#FFFFFF" }}
      >
      {/* Logo — 24px inset */}
      <Link
        href="/"
        className="pl-6 flex items-baseline gap-2 transition-opacity hover:opacity-90"
        aria-label={t("nav.homeAria")}
      >
        <span
          className="text-[18px] font-semibold tracking-[0.18em]"
          style={{
            background: "linear-gradient(135deg, #C9A84C 0%, #E5D4A0 50%, #C9A84C 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            textShadow: "none",
            filter: "drop-shadow(0 0 8px rgba(201,168,76,0.45))",
          }}
        >
          OSGARD
        </span>
        <span
          className="text-[13px] font-light tracking-[0.28em]"
          style={{ color: "#E5E4E2", opacity: 0.9 }}
        >
          NEW WORLD
        </span>
      </Link>

      {/* Primary menu — только ключевые разделы, остальное в боковом меню.
          min-w-0 отдаёт этому блоку право сжиматься первым — без него flex-item
          держит свою content-based ширину как жёсткий минимум и наезжает на
          правый кластер вместо того, чтобы уступить ему место на 768–1023px
          (core nav уже видна по md:, а правый кластер ещё не сжал себя валютами
          под lg:). Сам underline-индикатор активного пункта остаётся видимым —
          overflow здесь не трогаем. */}
      <nav
        className="ml-10 hidden min-w-0 items-center gap-7 overflow-x-auto overflow-y-hidden md:flex [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={t("nav.mainNav")}
      >
        {coreItems.map(({ key, href, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={key}
              href={href}
              aria-label={t(key)}
              aria-current={active ? "page" : undefined}
              className="group relative flex shrink-0 items-center whitespace-nowrap pb-4 pt-1 text-[14px] font-normal transition-all duration-150 hover:-translate-y-px"
              style={{ color: active ? "var(--color-gold)" : "rgba(255,255,255,0.6)" }}
            >
              <Icon
                size={16}
                strokeWidth={1.5}
                className="transition-colors group-hover:opacity-100 xl:mr-2"
                style={{ color: active ? "var(--color-gold)" : "#6A6A8A" }}
                aria-hidden="true"
              />
              {/* Текст пункта появляется только с xl (1280px). На lg (1024px)
                  текст + имя профиля появляются ОДНОВРЕМЕННО (оба завязаны на
                  один и тот же брейкпоинт), и суммарная ширина в моменте
                  превышает доступное место — измерено: nav.scrollWidth=461px
                  при clientWidth=369px на 1024px (скрытый скроллбар молча
                  обрезал "Оркестратор" без видимого наложения). На md–lg
                  остаются только иконки (имя доступно через aria-label). */}
              <span className="hidden group-hover:opacity-100 xl:inline" style={{ opacity: active ? 1 : undefined }}>
                {t(key)}
              </span>
              {/* underline = width of the item content. bottom-0 (not a negative
                  offset) keeps it inside the link's own box so nav's
                  overflow-x-auto safety net (which forces overflow-y to clip
                  too) never cuts it off. */}
              <span
                className="absolute bottom-0 left-0 h-0.5 w-full transition-opacity"
                style={{ backgroundColor: "var(--color-gold)", opacity: active ? 1 : 0 }}
                aria-hidden="true"
              />
            </Link>
          )
        })}
      </nav>


      {/* Right side — 4-currency balances, notifications, mail, profile.
          flex-shrink-0: этот кластер не должен сжиматься под давлением core nav —
          именно отсутствие этого свойства раньше давало визуальную тесноту на
          768–1023px (см. min-w-0 у соседнего nav выше). */}
      <div className="ml-auto flex shrink-0 items-center gap-5 pr-6">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t("nav.mainNav")}
          aria-haspopup="dialog"
          aria-expanded={drawerOpen}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-white/5"
          style={{ color: "#6A6A8A", border: "1px solid #2A2A3E" }}
        >
          <Menu size={16} strokeWidth={1.75} aria-hidden="true" />
          {/* Текст и валютные балансы вместе физически не влезают рядом с
              полным core-nav (4 пункта) на самой границе 2xl (1536px) — измерено:
              nav.scrollWidth=461px против clientWidth=430px ровно на 1536px
              ("Оркестратор" молча обрезался до "Оркестр" скрытым скроллбаром).
              На 1920px запас уже есть (461==461), поэтому вместо 2xl используем
              кастомный порог с запасом в ~64px. На md–1600 остаётся иконка +
              aria-label. */}
          <span className="hidden min-[1600px]:inline">{t("nav.more")}</span>
        </button>
        {/* Справка — что за платформа, кому нужна, инвестиции (заметный акцент) */}
        <Link
          href="/about"
          aria-label={t("nav.about")}
          aria-current={isActive("/about") ? "page" : undefined}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12px] font-semibold transition-colors hover:bg-white/5"
          style={{ color: "var(--color-gold)", border: "1px solid var(--color-gold)" }}
        >
          <HelpCircle size={16} strokeWidth={1.9} aria-hidden="true" />
          <span className="hidden min-[1600px]:inline">{t("nav.about")}</span>
        </Link>
        <div
          className="hidden items-center gap-1 rounded-full p-1 min-[1600px]:flex"
          style={{ border: `1px solid ${isActive("/wallet") ? "var(--color-gold)" : "#2A2A3E"}` }}
          role="group"
          aria-label={t("nav.currencyBalances")}
        >

          {CURRENCY_ORDER.map((id) => {
            const c = CURRENCIES[id]
            const CIcon = c.Icon
            return (
              <Link
                key={id}
                href="/wallet"
                aria-label={`${c.label}: ${formatCurrencyAmount(id, wallet[id])}`}
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-white/5"
                style={{ color: c.color }}
              >
                <CIcon
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                  style={c.elite ? { filter: "drop-shadow(0 0 4px rgba(255,215,0,0.7))" } : undefined}
                />
                {formatCurrencyAmount(id, wallet[id])}
              </Link>
            )
          })}
        </div>
        <LanguageSwitcher />
        <Link
          href="/notifications"
          aria-label={t("nav.notifications")}
          aria-current={isActive("/notifications") ? "page" : undefined}
          className="relative flex items-center gap-1.5 transition-colors hover:text-white"
          style={{ color: isActive("/notifications") ? "var(--color-gold)" : "#6A6A8A" }}
        >
          <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
          <Badge count={isAuthenticated ? unreadCount : 0} />
          {showNotificationsLabel && (
            <span className="text-[12px] transition-opacity" aria-hidden="true">
              {t("nav.notifications")}
            </span>
          )}
        </Link>
        <Link
          href="/messages"
          aria-label={t("nav.messages")}
          aria-current={isActive("/messages") ? "page" : undefined}
          className="relative flex items-center gap-1.5 transition-colors hover:text-white"
          style={{ color: isActive("/messages") ? "var(--color-gold)" : "#6A6A8A" }}
        >
          <Mail size={18} strokeWidth={1.5} aria-hidden="true" />
          <Badge count={0} />
          {showMessagesLabel && (
            <span className="text-[12px] transition-opacity" aria-hidden="true">
              {t("nav.messages")}
            </span>
          )}
        </Link>

        <ProfileMenu
          isAuthenticated={isAuthenticated}
          displayName={user?.displayName || user?.username || t("nav.guest")}
          avatarUrl={user?.avatarUrl || AVATAR}
          isProfileActive={isActive("/profile")}
          onLogout={logout}
        />
      </div>
      </header>
      <NavDrawer items={navItems} isActive={isActive} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </div>
  )
}
