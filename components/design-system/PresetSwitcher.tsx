"use client"

import { Moon, Sun, WandSparkles } from "lucide-react"
import { useDesignSystem, type DesignPreset } from "./DesignSystemProvider"

const labels: Record<DesignPreset, string> = { minimal: "Minimal", bold: "Bold", playful: "Playful", corporate: "Corporate", futuristic: "Futuristic" }

export function PresetSwitcher() {
  const { preset, theme, setPreset, setTheme } = useDesignSystem()
  const themeAction = theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"
  return <div className="ds-preset-switcher" aria-label="Стиль интерфейса"><WandSparkles size={15} aria-hidden="true" /><select value={preset} onChange={event => setPreset(event.target.value as DesignPreset)} aria-label="Пресет дизайна">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className="ds-theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={themeAction} title={themeAction}>{theme === "dark" ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}</button></div>
}
