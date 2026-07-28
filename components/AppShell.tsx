"use client"

/* ================================================================
   AppShell — клиентская обёртка для всего приложения
   ----------------------------------------------------------------
   Монтирует глобальные провайдеры и UI-слои которые требуют
   client-side контекста:
   - ReadonlyModeProvider — режим просмотра для гостей
   - PaywallModal — модалка при попытке действия гостем
   ================================================================ */

import { type ReactNode } from "react"
import { ReadonlyModeProvider } from "@/lib/readonly-mode"
import { PaywallModal } from "./PaywallModal"
import { GlobalHotkeys } from "@/lib/use-hotkeys"
import { AmbientBackdrop } from "./ambient-backdrop"
import { DevModeProvider } from "@/lib/dev-mode"
import { MatrixTransition } from "./dev-mode/MatrixTransition"
import { AppShellContent } from "./dev-mode/AppShellContent"
import { WorldOnlyLayers } from "./dev-mode/WorldOnlyLayers"

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
