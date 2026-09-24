import { NextRequest, NextResponse } from "next/server"

const allowed = new Set(["app-shell", "hero", "bento-grid", "form-wizard", "preview-frame", "cinematic-sequence"])
const fallbackStages = ["intent", "architecture", "build", "preview", "approval"]

type BlueprintInput = { app?: unknown; brief?: unknown; preset?: unknown; components?: unknown }

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as BlueprintInput
  const brief = text(body.brief, 1200)
  if (brief.length < 12) return NextResponse.json({ error: "brief_too_short", minimumCharacters: 12 }, { status: 400 })
  const app = text(body.app, 64).toLowerCase().replace(/[^a-z0-9-_]/g, "-") || "universal"
  const preset = ["minimal", "bold", "playful", "corporate", "futuristic"].includes(text(body.preset, 20)) ? text(body.preset, 20) : "futuristic"
  const requested = Array.isArray(body.components) ? body.components.filter((item): item is string => typeof item === "string") : []
  const selected = [...new Set((requested.length ? requested : ["app-shell", "hero", "bento-grid", "preview-frame", "cinematic-sequence"]).filter(id => allowed.has(id)))]
  return NextResponse.json({ version: "1.0.0", blueprint: { app, preset, brief, components: selected, stages: fallbackStages, generatedAt: new Date().toISOString(), arbitraryHtml: false } }, { status: 201, headers: { "cache-control": "no-store" } })
}
