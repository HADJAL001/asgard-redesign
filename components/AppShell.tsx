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
import { JarvisFloatingWidget } from "./JarvisFloatingWidget"
import { AmbientBackdrop } from "./ambient-backdrop"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ReadonlyModeProvider>
      {/* Живой фон всей платформы (z-0, под контентом). Оживляет каждую
          страницу, не только дашборд. См. components/ambient-backdrop.tsx. */}
      <AmbientBackdrop />
      {children}
      <PaywallModal />
      <GlobalHotkeys />
      <JarvisFloatingWidget />
    </ReadonlyModeProvider>
  )
}
