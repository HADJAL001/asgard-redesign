"use client"

/* ================================================================
   AppShell — клиентская обёртка для всего приложения
   ----------------------------------------------------------------
   Монтирует глобальные провайдеры и UI-слои которые требуют
   client-side контекста:
   - ReadonlyModeProvider — режим просмотра для гостей
   - PaywallModal — модалка при попытке действия гостем
   ================================================================ */

import dynamic from "next/dynamic"
import { type ReactNode } from "react"
import { ReadonlyModeProvider } from "@/lib/readonly-mode"
import { AmbientBackdrop } from "./ambient-backdrop"
import { DevModeProvider } from "@/lib/dev-mode"
import { AppShellContent } from "./dev-mode/AppShellContent"

// These overlays are useful after a person starts navigating, but do not belong
// in the critical landing-page bundle.
const PaywallModal = dynamic(() => import("./PaywallModal").then((m) => m.PaywallModal), { ssr: false })
const GlobalHotkeys = dynamic(() => import("@/lib/use-hotkeys").then((m) => m.GlobalHotkeys), { ssr: false })
const WorldOnlyLayers = dynamic(() => import("./dev-mode/WorldOnlyLayers").then((m) => m.WorldOnlyLayers), { ssr: false })
const MatrixTransition = dynamic(() => import("./dev-mode/MatrixTransition").then((m) => m.MatrixTransition), { ssr: false })

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <DevModeProvider>
      <ReadonlyModeProvider>
        {/* Живой фон всей платформы (z-0, под контентом). Оживляет каждую
            страницу, не только дашборд. См. components/ambient-backdrop.tsx.
            В режиме разработчика тот же слой перекрашивается в холодную
            сине-серебряную гамму (globals.css, блок DEV MODE). */}
        <AmbientBackdrop />
        {/* Обёртка нужна ради эффекта распада: в момент перехода контент
            уходит в blur, а канвас «Матрицы» рисуется поверх. */}
        <AppShellContent>{children}</AppShellContent>
        <PaywallModal />
        <GlobalHotkeys />
        {/* ДЖАРВИС — часть мира OSGARD, в студии разработчика не монтируется. */}
        <WorldOnlyLayers />
        {/* Киношный переход между мирами. Сам себя не рисует, пока не
            запущено переключение, и полностью отключён при
            prefers-reduced-motion (см. lib/dev-mode.tsx). */}
        <MatrixTransition />
      </ReadonlyModeProvider>
    </DevModeProvider>
  )
}
