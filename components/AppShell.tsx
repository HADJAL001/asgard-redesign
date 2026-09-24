"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { type ReactNode } from "react"
import { useAuth } from "@/lib/auth-store"

const WorldShell = dynamic(() => import("./WorldShell").then((module) => module.WorldShell), {
  loading: () => (
    <div className="app-shell-loading" aria-busy="true" aria-label="Загрузка платформы">
      <div className="app-shell-loading__signal" aria-hidden="true" />
      <span className="ds-utility">OSGARD / INITIALIZING COMMAND DECK</span>
      <style>{` .app-shell-loading{min-height:100vh;display:grid;place-content:center;justify-items:center;gap:14px;padding:24px;background:#071016;color:#9bb4bc;font:11px var(--ds-utility,monospace);letter-spacing:.1em}.app-shell-loading__signal{width:44px;height:44px;border:1px solid #64d9e8;border-radius:50%;box-shadow:0 0 28px #64d9e855;animation:app-shell-loading-pulse 1.4s ease-in-out infinite}@keyframes app-shell-loading-pulse{50%{transform:scale(1.12);opacity:.55}}@media(prefers-reduced-motion:reduce){.app-shell-loading__signal{animation:none}}`}</style>
    </div>
  ),
})

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()

  // Landing has its own star field and globe. Do not load the stateful product
  // shell until a person enters the app or an authenticated workspace.
  if (pathname === "/" && !isAuthenticated) return <>{children}</>

  return <WorldShell>{children}</WorldShell>
}
