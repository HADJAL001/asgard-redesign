"use client"

import { useEffect, useState, type ReactNode } from "react"

/**
 * Landing content is client-rendered. Rendering the global footer before that
 * tree has its final height places it in the first viewport, then shifts it
 * below the page during hydration. Mount it after hydration instead.
 */
export function DeferredFooter({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return mounted ? <>{children}</> : null
}
