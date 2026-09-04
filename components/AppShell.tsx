"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"
import { type ReactNode } from "react"
import { useAuth } from "@/lib/auth-store"

const WorldShell = dynamic(() => import("./WorldShell").then((module) => module.WorldShell))

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { isAuthenticated } = useAuth()

  // Landing has its own star field and globe. Do not load the stateful product
  // shell until a person enters the app or an authenticated workspace.
  if (pathname === "/" && !isAuthenticated) return <>{children}</>

  return <WorldShell>{children}</WorldShell>
}
