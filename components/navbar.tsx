"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Home,
  FolderKanban,
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
  type LucideIcon,
} from "lucide-react"

import { useOsgard } from "@/lib/store/osgard-store"
import { useAuth } from "@/lib/auth-store"
import { CURRENCIES, CURRENCY_ORDER, formatCurrencyAmount } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { LOCALES, LOCALE_SHORT, LOCALE_LABELS, type Locale } from "@/lib/i18n"
import { useState, useRef, useEffect } from "react"
import { Globe } from "lucide-react"


/* ---- Palette ----
   panel #0A0A0F · accent #00D4FF · text #FFFFFF · icon/label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

export type NavItem = { key: string; href: string; Icon: LucideIcon }

export const NAV: NavItem[] = [
  { key: "nav.home", href: "/", Icon: Home },
  { key: "nav.projects", href: "/projects", Icon: FolderKanban },
  { key: "nav.community", href: "/community", Icon: Beer },
  { key: "nav.forge", href: "/forge", Icon: Hammer },
  { key: "nav.marketplace", href: "/marketplace", Icon: ShoppingBag },
  { key: "nav.exchange", href: "/exchange", Icon: TrendingUp },
  { key: "nav.stake", href: "/stake", Icon: Lock },
  { key: "nav.twin", href: "/twin", Icon: Sparkle },
  { key: "nav.economy", href: "/economy", Icon: BarChart3 },
  { key: "nav.referral", href: "/referral", Icon: Users },
  { key: "nav.messages", href: "/messages", Icon: MessageCircle },

]

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
              style={{ color: locale === l ? "#00D4FF" : "rgba(255,255,255,0.8)" }}
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
        <img
          src={avatarUrl || "/placeholder.svg"}
          alt="Гость"
          className="size-8 rounded-full object-cover"
          style={{ border: "1px solid #2A2A3E" }}
        />
        <span className="hidden text-[14px] sm:block" style={{ color: "rgba(255,255,255,0.8)" }}>
          Гость
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
        <img
          src={avatarUrl || "/placeholder.svg"}
          alt={displayName}
          className="size-8 rounded-full object-cover"
          style={{ border: `1px solid ${isProfileActive || open ? "#00D4FF" : "#2A2A3E"}` }}
        />
        <span
          className="hidden text-[14px] sm:block"
          style={{ color: isProfileActive || open ? "#00D4FF" : "rgba(255,255,255,0.8)" }}
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
            Выйти
          </button>
        </div>
      )}
    </div>
  )
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full text-[10px] font-medium leading-none"
      style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")

  const navItems = user?.role === "admin" ? [...NAV, { key: "nav.admin", href: "/admin", Icon: ShieldCheck }] : NAV

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
        aria-label="OSGARD NEW WORLD — главная"
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

      {/* Primary menu — 32px gaps, icon + label, active underline */}
      <nav className="ml-10 hidden items-center gap-8 md:flex" aria-label={t("nav.mainNav")}>
        {navItems.map(({ key, href, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={key}
              href={href}
              aria-current={active ? "page" : undefined}
              className="group relative flex items-center py-1 text-[14px] font-normal transition-all duration-150 hover:-translate-y-px"
              style={{ color: active ? "#00D4FF" : "rgba(255,255,255,0.6)" }}
            >
              <Icon
                size={16}
                strokeWidth={1.5}
                className="mr-2 transition-colors group-hover:opacity-100"
                style={{ color: active ? "#00D4FF" : "#6A6A8A" }}
                aria-hidden="true"
              />
              <span className="group-hover:opacity-100" style={{ opacity: active ? 1 : undefined }}>
                {t(key)}
              </span>
              {/* underline = width of the item content */}
              <span
                className="absolute -bottom-[21px] left-0 h-0.5 w-full transition-opacity"
                style={{ backgroundColor: "#00D4FF", opacity: active ? 1 : 0 }}
                aria-hidden="true"
              />
            </Link>
          )
        })}
      </nav>


      {/* Right side — 4-currency balances, notifications, mail, profile */}
      <div className="ml-auto flex items-center gap-5 pr-6">
        <div
          className="hidden items-center gap-1 rounded-full p-1 lg:flex"
          style={{ border: `1px solid ${isActive("/wallet") ? "#00D4FF" : "#2A2A3E"}` }}
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
          className="relative transition-colors hover:text-white"
          style={{ color: isActive("/notifications") ? "#00D4FF" : "#6A6A8A" }}
        >
          <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
          <Badge count={1} />
        </Link>
        <button
          type="button"
          aria-label={t("nav.messages")}
          className="relative transition-colors hover:text-white"
          style={{ color: "#6A6A8A" }}
        >
          <Mail size={18} strokeWidth={1.5} aria-hidden="true" />
          <Badge count={0} />
        </button>

        <ProfileMenu
          isAuthenticated={isAuthenticated}
          displayName={user?.displayName || user?.username || "Гость"}
          avatarUrl={user?.avatarUrl || AVATAR}
          isProfileActive={isActive("/profile")}
          onLogout={logout}
        />
      </div>
      </header>
    </div>
  )
}
