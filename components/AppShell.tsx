"use client"

/* ================================================================
   AppShell — клиентская обёртка для всего приложения
   ----------------------------------------------------------------
   Монтирует глобальные провайдеры и UI-слои которые требуют
   client-side контекста:
   - ReadonlyModeProvider — режим просмотра для гостей
   - ReadonlyBanner — полоска внизу для незарегистрированных
   - PaywallModal — модалка при попытке действия гостем
   ================================================================ */

import { type ReactNode } from "react"
import { ReadonlyModeProvider } from "@/lib/readonly-mode"
import { ReadonlyBanner } from "./ReadonlyBanner"
import { PaywallModal } from "./PaywallModal"
import { GlobalHotkeys } from "@/lib/use-hotkeys"
import { JarvisFloatingWidget } from "./JarvisFloatingWidget"
import { RoamingAvatar } from "./RoamingAvatar"

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ReadonlyModeProvider>
      {children}
      <ReadonlyBanner />
      <PaywallModal />
      <GlobalHotkeys />
      <JarvisFloatingWidget />
      <RoamingAvatar />
    </ReadonlyModeProvider>
  )
}
