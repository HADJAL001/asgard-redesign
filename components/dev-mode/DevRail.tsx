"use client"

/* ================================================================
   OSGARD · DevRail — навигация студии разработчика.
   ----------------------------------------------------------------
   Четыре раздела вместо 24 пунктов обычного Navbar. Форма выбрана по
   привычному языку сред разработки (VS Code, Replit, Cursor): узкий
   вертикальный рельс слева. Он не ест высоту экрана — а высота здесь
   дороже ширины, потому что под ней живут код и превью.

   На узких экранах рельс превращается в нижнюю полосу: вертикальная
   колонка на телефоне отняла бы у контента треть ширины.

   Разделы намеренно перечислены здесь, а не в общем NAV: Dev Mode —
   слой поверх платформы, и обычная навигация про него не знает
   (см. lib/dev-mode.tsx, раздел про архитектуру «слой поверх»).
   ================================================================ */

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Sparkles, Bot, Rocket, Code2, Brain, type LucideIcon } from "lucide-react"

type DevSection = {
  href: string
  label: string
  Icon: LucideIcon
  /** Полная подсказка для screen reader и тултипа — короткая подпись не всё объясняет. */
  hint: string
}

/** Мастерская намеренно без `[id]`: раздел ведёт на выбор проекта, а
 *  конкретный проект открывается уже оттуда (/dev/workspace/:id). */
export const DEV_SECTIONS: DevSection[] = [
  { href: "/dev", label: "Студия", Icon: Sparkles, hint: "Студия — описать идею и создать приложение" },
  { href: "/dev/agents", label: "Агенты", Icon: Bot, hint: "Агенты — кто и над чем работает прямо сейчас" },
  { href: "/dev/workspace", label: "Код", Icon: Code2, hint: "Код — файлы, редактор и живое превью приложения" },
  { href: "/dev/deploy", label: "Деплой", Icon: Rocket, hint: "Деплой — публикация и адреса готовых приложений" },
  /* Память стоит последней осознанно: это не шаг работы над приложением, а отчёт о
     самой платформе — чему она научилась на прошлых сборках. */
  { href: "/dev/memory", label: "Память", Icon: Brain, hint: "Память — чему платформа научилась на своих ошибках" },
]

/** Активен раздел, если путь совпадает или лежит внутри него.
 *  Для корня студии — только точное совпадение, иначе «Студия» горела бы
 *  подсвеченной на каждом экране (все они начинаются с /dev). */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dev") return pathname === "/dev"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function DevRail() {
  const pathname = usePathname() || "/dev"

  return (
    <nav className="dev-rail" aria-label="Разделы студии разработчика">
      {DEV_SECTIONS.map(({ href, label, Icon, hint }) => {
        const active = isActive(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            title={hint}
            aria-label={hint}
            aria-current={active ? "page" : undefined}
            className={`dev-rail__item${active ? " dev-rail__item--active" : ""}`}
          >
            <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
            <span className="dev-rail__label">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
