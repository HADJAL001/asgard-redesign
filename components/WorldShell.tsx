"use client"

import dynamic from "next/dynamic"
import { type ReactNode } from "react"
import { ReadonlyModeProvider } from "@/lib/readonly-mode"
import { AmbientBackdrop } from "./ambient-backdrop"
import { DevModeProvider } from "@/lib/dev-mode"
import { AppShellContent } from "./dev-mode/AppShellContent"

const PaywallModal = dynamic(() => import("./PaywallModal").then((module) => module.PaywallModal), { ssr: false })
const GlobalHotkeys = dynamic(() => import("@/lib/use-hotkeys").then((module) => module.GlobalHotkeys), { ssr: false })
const WorldOnlyLayers = dynamic(() => import("./dev-mode/WorldOnlyLayers").then((module) => module.WorldOnlyLayers), { ssr: false })
const MatrixTransition = dynamic(() => import("./dev-mode/MatrixTransition").then((module) => module.MatrixTransition), { ssr: false })

/** Full interactive shell for product routes and signed-in workspaces. */
export function WorldShell({ children }: { children: ReactNode }) {
  return (
    <DevModeProvider>
      <ReadonlyModeProvider>
        <AmbientBackdrop />
        <AppShellContent>{children}</AppShellContent>
        <PaywallModal />
        <GlobalHotkeys />
        <WorldOnlyLayers />
        <MatrixTransition />
      </ReadonlyModeProvider>
    </DevModeProvider>
  )
}
