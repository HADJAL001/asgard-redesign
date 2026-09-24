import { NextRequest, NextResponse } from "next/server"

const allowed = new Set(["app-shell", "hero", "bento-grid", "form-wizard", "preview-frame", "cinematic-sequence"])
const fallbackStages = ["intent", "architecture", "build", "preview", "approval"]

type BlueprintInput = { app?: unknown; brief?: unknown; preset?: unknown; components?: unknown }

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export async function POST(request: NextRequest) {
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const contentLength = Number(request.headers.get("content-length") || 0)
  if (contentLength > 32_000) return NextResponse.json({ error: "brief_payload_too_large", maxBytes: 32_000 }, { status: 413 })
  const body = await request.json().catch(() => ({})) as BlueprintInput
  const brief = text(body.brief, 1200)
  if (brief.length < 12) return NextResponse.json({ error: "brief_too_short", minimumCharacters: 12 }, { status: 400 })
  const app = text(body.app, 64).toLowerCase().replace(/[^a-z0-9-_]/g, "-") || "universal"
  const preset = ["minimal", "bold", "playful", "corporate", "futuristic"].includes(text(body.preset, 20)) ? text(body.preset, 20) : "futuristic"
  const requested = Array.isArray(body.components) ? body.components.filter((item): item is string => typeof item === "string") : []
  const selected = [...new Set((requested.length ? requested : ["app-shell", "hero", "bento-grid", "preview-frame", "cinematic-sequence"]).filter(id => allowed.has(id)))]
  const warnings = [
    !selected.includes("app-shell") ? "app_shell_required_for_navigation" : null,
    !selected.includes("preview-frame") ? "preview_required_for_proof" : null,
    !selected.includes("cinematic-sequence") ? "cinematic_sequence_optional" : null,
  ].filter((value): value is string => Boolean(value))
  const qualityScore = Math.max(0, 100 - warnings.length * 15 - (brief.length < 80 ? 10 : 0))
  return NextResponse.json({ version: "1.1.0", blueprint: { app, preset, brief, components: selected, stages: fallbackStages, generatedAt: new Date().toISOString(), arbitraryHtml: false, quality: { score: qualityScore, warnings, humanReviewRequired: qualityScore < 85 } } }, { status: 201, headers: { "cache-control": "no-store" } })
}
