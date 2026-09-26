"use client"

import { useEffect, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"

/**
 * Landing content is client-rendered. Rendering the global footer before that
 * tree has its final height places it in the first viewport, then shifts it
 * below the page during hydration. Mount it after hydration instead.
 */
export function DeferredFooter({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  // Cofounder is a focused command deck, not the economy/navigation shell.
  // Keep its mission and replay views free of the global platform footer.
  if (pathname === "/cofounder" || pathname?.startsWith("/cofounder/")) return null

  return mounted ? <>{children}</> : null
}
