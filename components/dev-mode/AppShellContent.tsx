"use client"

/* ================================================================
   OSGARD · AppShellContent — обёртка контента платформы, знающая
   про переход между режимами.
   ----------------------------------------------------------------
   Единственная задача: в момент переключения повесить на контент класс
   `.app-root-content` внутри `.mode-switching`, из-за чего экран уходит
   в blur и слегка сжимается (globals.css). Именно это делает распад
   на пиксели убедительным: точки разлетаются НАД реально «плывущим»
   интерфейсом, а не над статичной картинкой.

   Отдельный файл, а не логика в AppShell: AppShell импортируется из
   серверного app/layout.tsx, а useDevMode — клиентский хук.
   ================================================================ */

import { type ReactNode } from "react"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { useDevMode } from "@/lib/dev-mode"
import { track } from "@/lib/analytics"

export function AppShellContent({ children }: { children: ReactNode }) {
  const { transitioning } = useDevMode()
  const pathname = usePathname()

  useEffect(() => {
    track("route_view", { path: pathname })
  }, [pathname])

  return (
    <div className={transitioning ? "mode-switching" : undefined}>
      <main id="main-content" tabIndex={-1} className="app-root-content">{children}</main>
    </div>
  )
}
