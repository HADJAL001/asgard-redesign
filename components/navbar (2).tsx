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
  type LucideIcon,
} from "lucide-react"
import { useOsgard } from "./osgard-store"
import { TCTickerBar } from "./tc-ticker-bar"
import { CURRENCIES, CURRENCY_ORDER, formatCurrencyAmount } from "@/lib/economy"

/* ---- Palette ----
   panel #0A0A0F · accent #00D4FF · text #FFFFFF · icon/label #6A6A8A · border #2A2A3E */

const AVATAR =
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80"

type NavItem = { label: string; href: string; Icon: LucideIcon }

const NAV: NavItem[] = [
  { label: "Главная", href: "/", Icon: Home },
  { label: "Проекты", href: "/projects", Icon: FolderKanban },
  { label: "Таверна", href: "/community", Icon: Beer },
  { label: "Кузница", href: "/forge", Icon: Hammer },
  { label: "Маркет", href: "/marketplace", Icon: ShoppingBag },
  { label: "Биржа", href: "/exchange", Icon: TrendingUp },
  { label: "Стейкинг", href: "/stake", Icon: Lock },
  { label: "Экономика", href: "/economy", Icon: BarChart3 },
  { label: "Чат", href: "/messages", Icon: MessageCircle },
]

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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/")

  return (
    <div className="sticky top-0 z-40 font-sans">
      <TCTickerBar />
      <header
        className="flex h-16 items-center"
        style={{ backgroundColor: "#0A0A0F", borderBottom: "1px solid #2A2A3E", color: "#FFFFFF" }}
      >
      {/* Logo — 24px inset */}
      <Link
        href="/"
        className="pl-6 text-[18px] font-light tracking-[0.22em] transition-opacity hover:opacity-90"
        style={{ color: "#00D4FF" }}
      >
        OSGARD
      </Link>

      {/* Primary menu — 32px gaps, icon + label, active underline */}
      <nav className="ml-10 hidden items-center gap-8 md:flex" aria-label="Основная навигация">
        {NAV.map(({ label, href, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={label}
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
                {label}
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
          aria-label="Балансы валют"
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
        <Link
          href="/notifications"
          aria-label="Уведомления"
          aria-current={isActive("/notifications") ? "page" : undefined}
          className="relative transition-colors hover:text-white"
          style={{ color: isActive("/notifications") ? "#00D4FF" : "#6A6A8A" }}
        >
          <Bell size={18} strokeWidth={1.5} aria-hidden="true" />
          <Badge count={1} />
        </Link>
        <button
          type="button"
          aria-label="Сообщения"
          className="relative transition-colors hover:text-white"
          style={{ color: "#6A6A8A" }}
        >
          <Mail size={18} strokeWidth={1.5} aria-hidden="true" />
          <Badge count={0} />
        </button>
        <Link
          href="/profile"
          aria-current={isActive("/profile") ? "page" : undefined}
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
        >
          <img
            src={AVATAR || "/placeholder.svg"}
            alt="Alex Odin"
            className="size-8 rounded-full object-cover"
            style={{ border: `1px solid ${isActive("/profile") ? "#00D4FF" : "#2A2A3E"}` }}
          />
          <span
            className="hidden text-[14px] sm:block"
            style={{ color: isActive("/profile") ? "#00D4FF" : "rgba(255,255,255,0.8)" }}
          >
            Alex Odin
          </span>
        </Link>
      </div>
      </header>
    </div>
  )
}
