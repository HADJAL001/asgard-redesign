"use client"

/* ================================================================
   OSGARD · DevShell — оболочка режима разработчика.
   ----------------------------------------------------------------
   Заменяет 24-пунктовый Navbar шапкой из трёх элементов (DevTopBar) и
   рельсом из четырёх разделов (DevRail). Всё остальное на экране
   принадлежит задаче пользователя, а не платформе.

   Фон отдельно НЕ рисуется: глобальный AmbientBackdrop уже смонтирован
   в AppShell, а класс .dev-mode на <html> перекрашивает его в холодную
   сине-серебряную гамму (см. globals.css, блок DEV MODE).

   `wide` — для экранов, которым тесно в колонке чтения: Мастерская с
   кодом и превью просит всю ширину, студия и списки — нет.
   ================================================================ */

import { type ReactNode } from "react"
import { DevRail } from "./DevRail"
import { DevTopBar } from "./DevTopBar"

export function DevShell({
  children,
  wide = false,
  headerSlot,
}: {
  children: ReactNode
  wide?: boolean
  headerSlot?: ReactNode
}) {
  return (
    <div className="dev-mode-layout relative z-10 min-h-screen font-sans">
      <DevRail />
      <div className={`mx-auto ${wide ? "max-w-[1680px]" : "max-w-[1100px]"}`}>
        <DevTopBar>{headerSlot}</DevTopBar>
        <main className="px-6 pb-24 md:px-8">{children}</main>
      </div>
    </div>
  )
}
