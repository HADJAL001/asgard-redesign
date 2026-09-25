import Link from "next/link"
import { ArrowLeftRight, BadgeDollarSign, ExternalLink, FileText, FolderKanban, Hammer, LifeBuoy, MessageCircle, Shield, ShoppingBag, Smartphone, Sparkles, Trophy, WalletCards } from "lucide-react"
import type { LucideIcon } from "lucide-react"

const RUSTORE_APP_URL = "https://www.rustore.ru/catalog/app/com.osgard.app"

const DOCK_LINKS: { label: string; href: string; Icon: LucideIcon }[] = [
  { label: "Кузница", href: "/forge", Icon: Hammer },
  { label: "Маркетплейс", href: "/marketplace", Icon: ShoppingBag },
  { label: "Биржа", href: "/exchange", Icon: ArrowLeftRight },
  { label: "Стейкинг", href: "/stake", Icon: BadgeDollarSign },
  { label: "Проекты", href: "/projects", Icon: FolderKanban },
  { label: "Зал славы", href: "/hall-of-fame", Icon: Trophy },
  { label: "Кошелёк", href: "/wallet", Icon: WalletCards },
  { label: "AI-близнец", href: "/twin", Icon: Sparkles },
  { label: "Поддержка", href: "/support", Icon: LifeBuoy },
  { label: "Обратная связь", href: "/feedback", Icon: MessageCircle },
  { label: "Тарифы", href: "/pricing", Icon: BadgeDollarSign },
  { label: "Документы", href: "/privacy", Icon: FileText },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="osgard-footer"
    >
      {/* Разделитель с неоновым свечением */}
      <div
        style={{
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(229,228,226,0.28) 50%, transparent)",
        }}
      />

      <div className="mx-auto max-w-[1240px] px-6 py-12 md:px-10">
        <div className="osgard-footer__top">
          {/* Лого + описание */}
          <div>
            <Link href="/" className="inline-flex items-baseline gap-2 transition-opacity hover:opacity-80">
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: "0.18em",
                  background: "linear-gradient(135deg, #C9A84C 0%, #E5D4A0 50%, #C9A84C 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  filter: "drop-shadow(0 0 10px rgba(201,168,76,0.4))",
                }}
              >
                OSGARD
              </span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 300,
                  letterSpacing: "0.28em",
                  color: "#E5E4E2",
                  opacity: 0.85,
                }}
              >
                NEW WORLD
              </span>
            </Link>

            <p
              className="mt-4 text-[13px] leading-relaxed"
              style={{ color: "rgba(229,228,226,0.45)", maxWidth: 240 }}
            >
              AI-платформа для превращения идей в рабочие проекты: от первого брифа до запуска, проверки и развития продукта.
            </p>

            <a
              href={RUSTORE_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Скачать приложение OSGARD в RuStore"
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md border px-3.5 text-[12px] font-semibold text-white transition-colors hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10"
              style={{ borderColor: "rgba(201,168,76,0.35)", background: "rgba(255,255,255,0.03)" }}
            >
              <Smartphone aria-hidden="true" size={16} strokeWidth={1.8} />
              Скачать в RuStore
              <ExternalLink aria-hidden="true" size={13} strokeWidth={1.8} className="opacity-60" />
            </a>

            <span className="osgard-footer__mark" aria-hidden="true" />
          </div>

          <nav className="osgard-dock" aria-label="Основная навигация платформы">
            {DOCK_LINKS.map(({ label, href, Icon }) => (
              <Link key={href} href={href} className="osgard-dock__item" aria-label={label} title={label}>
                <Icon aria-hidden="true" size={18} strokeWidth={1.6} />
                <span>{label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Нижняя часть — копирайт */}
        <div
          className="osgard-footer__bottom"
        >
          <span>
            © {year}{" "}
            <span style={{ color: "rgba(201,168,76,0.7)" }}>OSGARD NEW WORLD</span>
            {" "}— All rights reserved{" "}
            <span style={{ color: "rgba(229,228,226,0.15)" }}>· платежа</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Shield aria-hidden="true" size={12} strokeWidth={1.5} />
            <span>Создаём проекты вместе · TimeCoin внутри платформы</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
