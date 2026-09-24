import { NextRequest, NextResponse } from "next/server"

const presets = new Set(["minimal", "bold", "playful", "corporate", "futuristic"])
const components = [
  { id: "app-shell", role: "navigation", states: ["default", "loading", "error"], required: ["landmark", "skip-link", "keyboard-nav"] },
  { id: "hero", role: "orientation", states: ["default", "reduced-motion"], props: ["eyebrow", "title", "description", "primaryAction"] },
  { id: "bento-grid", role: "overview", states: ["default", "empty", "loading"], props: ["items", "columns", "density"] },
  { id: "form-wizard", role: "input", states: ["default", "invalid", "submitting", "success"], required: ["labels", "error-summary", "focus-return"] },
  { id: "preview-frame", role: "proof", states: ["connecting", "ready", "failed", "retrying"], required: ["status-live-region", "retry-action"] },
  { id: "cinematic-sequence", role: "progress", states: ["active", "complete", "paused"], props: ["stages", "currentStage", "reducedMotionFallback"] },
]

export function GET(request: NextRequest) {
  const rawPreset = request.nextUrl.searchParams.get("preset") || "futuristic"
  const preset = presets.has(rawPreset) ? rawPreset : "futuristic"
  const rawApp = request.nextUrl.searchParams.get("app") || "universal"
  const app = rawApp.toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 64) || "universal"
  return NextResponse.json({
    version: "1.0.0",
    profile: { app, preset, universal: true },
    componentRegistry: components,
    layout: { container: "fluid", grid: 12, spacingUnit: 8, breakpoints: ["400px", "768px", "1200px", "1920px"] },
    cinematic: { scenes: ["intent", "architecture", "build", "preview", "approval"], transition: "opacity-transform", maxDurationMs: 900, fallback: "static-progress" },
    guardrails: { maxMotionDurationMs: 900, reducedMotion: "static-progress", contrast: "WCAG-AA", allowArbitraryHtml: false, maxClientJsKb: 180, maxLayoutShift: 0.1, requiredStates: ["loading", "error", "empty"] },
  }, { headers: { "cache-control": "public, max-age=300, stale-while-revalidate=3600" } })
}
