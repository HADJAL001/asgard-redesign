import { NextRequest, NextResponse } from "next/server"

const presets = new Set(["minimal", "bold", "playful", "corporate", "futuristic"])
const components = [
  { id: "app-shell", role: "navigation", states: ["default", "loading", "error"] },
  { id: "hero", role: "orientation", states: ["default", "reduced-motion"] },
  { id: "bento-grid", role: "overview", states: ["default", "empty", "loading"] },
  { id: "form-wizard", role: "input", states: ["default", "invalid", "submitting", "success"] },
  { id: "preview-frame", role: "proof", states: ["connecting", "ready", "failed", "retrying"] },
  { id: "cinematic-sequence", role: "progress", states: ["active", "complete", "paused"] },
]

export function GET(request: NextRequest) {
  const rawPreset = request.nextUrl.searchParams.get("preset") || "futuristic"
  const preset = presets.has(rawPreset) ? rawPreset : "futuristic"
  const app = request.nextUrl.searchParams.get("app") || "universal"
  return NextResponse.json({
    version: "1.0.0",
    profile: { app, preset, universal: true },
    componentRegistry: components,
    layout: { container: "fluid", grid: 12, spacingUnit: 8, breakpoints: ["400px", "768px", "1200px", "1920px"] },
    cinematic: { scenes: ["intent", "architecture", "build", "preview", "approval"], transition: "opacity-transform", maxDurationMs: 900, fallback: "static-progress" },
    guardrails: { maxMotionDurationMs: 900, reducedMotion: "static-progress", contrast: "WCAG-AA", allowArbitraryHtml: false },
  }, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } })
}
