import { NextRequest, NextResponse } from "next/server"

const themes = {
  dark: { canvas: "#071016", surface: "#0D1C24", surfaceRaised: "#122B35", ink: "#EDF7F8", muted: "#9BB4BC", line: "#315864", primary: "#64D9E8", secondary: "#E5BB72", success: "#8CE6B3", warning: "#F3C773", danger: "#FF9F9A", info: "#8AB4FF" },
  light: { canvas: "#F3F7F6", surface: "#FFFFFF", surfaceRaised: "#E4EEF0", ink: "#11252B", muted: "#4E6971", line: "#AFC5C9", primary: "#087C8C", secondary: "#986815", success: "#147A4A", warning: "#855900", danger: "#B42318", info: "#175CD3" },
} as const

const presets = {
  minimal: { radius: "4px", density: "compact", effects: "none", theme: "light" },
  bold: { radius: "8px", density: "comfortable", effects: "contrast", theme: "dark" },
  playful: { radius: "16px", density: "comfortable", effects: "soft-glow", theme: "light" },
  corporate: { radius: "6px", density: "compact", effects: "quiet", theme: "light" },
  futuristic: { radius: "0px", density: "comfortable", effects: "hull-grid", theme: "dark" },
} as const

export function GET(request: NextRequest) {
  const rawPreset = request.nextUrl.searchParams.get("preset") || "futuristic"
  const preset = rawPreset in presets ? rawPreset as keyof typeof presets : "futuristic"
  const theme = request.nextUrl.searchParams.get("theme") === "light" ? "light" : presets[preset].theme
  return NextResponse.json({ version: "1.0.0", preset, theme, tokens: { colors: themes[theme], typography: { display: "Space Grotesk Variable", body: "Onest Variable", utility: "IBM Plex Mono", scale: 1.25 }, spacing: { unit: 4, grid: 8 }, motion: { fast: 140, normal: 220, slow: 420, reducedMotion: true }, presetConfig: presets[preset] } }, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } })
}
