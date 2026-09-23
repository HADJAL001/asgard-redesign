"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type DesignPreset = "minimal" | "bold" | "playful" | "corporate" | "futuristic"
type DesignSystemValue = { preset: DesignPreset; theme: "dark" | "light"; setPreset: (preset: DesignPreset) => void; setTheme: (theme: "dark" | "light") => void }
const DesignSystemContext = createContext<DesignSystemValue | null>(null)

export function DesignSystemProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<DesignPreset>("futuristic")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  useEffect(() => {
    void fetch("/api/design/tenant", { credentials: "same-origin" }).then(response => response.ok ? response.json() : null).then(data => {
      const brand = data?.brand
      if (!brand) return
      document.documentElement.dataset.tenant = brand.tenantId
      if (typeof brand.accent === "string") document.documentElement.style.setProperty("--ds-tenant-accent", brand.accent)
      if (typeof brand.displayFont === "string") document.documentElement.style.setProperty("--ds-tenant-display", brand.displayFont)
    }).catch(() => undefined)
  }, [])
  useEffect(() => {
    const storedPreset = window.localStorage.getItem("osgard-design-preset") as DesignPreset | null
    const storedTheme = window.localStorage.getItem("osgard-design-theme") as "dark" | "light" | null
    if (storedPreset && ["minimal", "bold", "playful", "corporate", "futuristic"].includes(storedPreset)) setPreset(storedPreset)
    if (storedTheme === "light" || storedTheme === "dark") setTheme(storedTheme)
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; document.documentElement.dataset.designPreset = preset; window.localStorage.setItem("osgard-design-preset", preset); window.localStorage.setItem("osgard-design-theme", theme) }, [preset, theme])
  const value = useMemo(() => ({ preset, theme, setPreset, setTheme }), [preset, theme])
  return <DesignSystemContext.Provider value={value}>{children}</DesignSystemContext.Provider>
}

export function useDesignSystem() {
  const value = useContext(DesignSystemContext)
  if (!value) throw new Error("useDesignSystem must be used inside DesignSystemProvider")
  return value
}
