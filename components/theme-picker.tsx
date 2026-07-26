"use client"

/* ================================================================
   OSGARD · ThemePicker — выбор темы для AI-генератора артефактов.
   1:1 по данным с mobile/types/artifact.ts (ARTIFACT_THEMES) и
   mobile/components/ThemePicker.tsx (визуал: сетка чипов 2 в ряд,
   выбранная — акцентная рамка/заливка/иконка).
   ================================================================ */

import { Rocket, Wand2, Cpu, Cog, type LucideIcon } from "lucide-react"
import { COLORS } from "@/lib/economy"

export const ARTIFACT_THEMES = [
  { key: "scifi", label: "Sci-Fi", hint: "Тема: научная фантастика, технологии будущего." },
  { key: "fantasy", label: "Fantasy", hint: "Тема: фэнтези, магия и мифические существа." },
  { key: "cyberpunk", label: "Cyberpunk", hint: "Тема: киберпанк, неон и мегаполисы будущего." },
  { key: "steampunk", label: "Steampunk", hint: "Тема: стимпанк, механизмы на паровой тяге." },
] as const

export type ArtifactThemeKey = (typeof ARTIFACT_THEMES)[number]["key"]

const THEME_ICONS: Record<ArtifactThemeKey, LucideIcon> = {
  scifi: Rocket,
  fantasy: Wand2,
  cyberpunk: Cpu,
  steampunk: Cog,
}

type ThemePickerProps = {
  value: ArtifactThemeKey | null
  onChange: (key: ArtifactThemeKey | null) => void
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Тема артефакта">
      {ARTIFACT_THEMES.map((theme) => {
        const Icon = THEME_ICONS[theme.key]
        const selected = value === theme.key
        return (
          <button
            key={theme.key}
            type="button"
            onClick={() => onChange(selected ? null : theme.key)}
            aria-pressed={selected}
            className="flex min-w-[45%] flex-1 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-colors"
            style={{
              borderColor: selected ? COLORS.accent : COLORS.border,
              background: selected ? `${COLORS.accent}1A` : "transparent",
            }}
          >
            <Icon size={16} style={{ color: selected ? COLORS.accent : "rgba(255,255,255,0.5)" }} aria-hidden="true" />
            <span className="text-[13px] font-medium" style={{ color: selected ? COLORS.accent : "rgba(255,255,255,0.6)" }}>
              {theme.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
