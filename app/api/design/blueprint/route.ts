import { NextRequest, NextResponse } from "next/server"

const WINDOW_MS = 60_000
const MAX_REQUESTS = 30
const requestWindows = new Map<string, { startedAt: number; count: number }>()

const allowed = new Set(["app-shell", "hero", "bento-grid", "form-wizard", "preview-frame", "cinematic-sequence"])
const fallbackStages = ["intent", "architecture", "build", "preview", "approval"]

type BlueprintInput = { app?: unknown; brief?: unknown; preset?: unknown; components?: unknown }

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const now = Date.now()
  const window = requestWindows.get(ip)
  const current = !window || now - window.startedAt >= WINDOW_MS ? { startedAt: now, count: 1 } : { startedAt: window.startedAt, count: window.count + 1 }
  requestWindows.set(ip, current)
  if (requestWindows.size > 1000) {
    for (const [key, value] of requestWindows) if (now - value.startedAt >= WINDOW_MS) requestWindows.delete(key)
  }
  const resetAt = Math.ceil((current.startedAt + WINDOW_MS) / 1000)
  const rateHeaders = { "x-rate-limit-limit": String(MAX_REQUESTS), "x-rate-limit-remaining": String(Math.max(0, MAX_REQUESTS - current.count)), "x-rate-limit-reset": String(resetAt) }
  if (current.count > MAX_REQUESTS) return NextResponse.json({ error: "rate_limited", requestId, retryAfterSeconds: Math.ceil((current.startedAt + WINDOW_MS - now) / 1000) }, { status: 429, headers: { ...rateHeaders, "retry-after": String(Math.ceil((current.startedAt + WINDOW_MS - now) / 1000)), "x-request-id": requestId } })
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required", requestId }, { status: 415, headers: { ...rateHeaders, "x-request-id": requestId } })
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > 32_000) return NextResponse.json({ error: "brief_payload_too_large", maxBytes: 32_000, requestId }, { status: 413, headers: { ...rateHeaders, "x-request-id": requestId } })
  const body = (() => { try { return JSON.parse(rawBody) as BlueprintInput } catch { return {} } })()
  const brief = text(body.brief, 1200)
  if (brief.length < 12) return NextResponse.json({ error: "brief_too_short", minimumCharacters: 12, requestId }, { status: 400, headers: { ...rateHeaders, "x-request-id": requestId } })
  const app = text(body.app, 64).toLowerCase().replace(/[^a-z0-9-_]/g, "-") || "universal"
  const preset = ["minimal", "bold", "playful", "corporate", "futuristic"].includes(text(body.preset, 20)) ? text(body.preset, 20) : "futuristic"
  const requested = Array.isArray(body.components) ? body.components.filter((item): item is string => typeof item === "string") : []
  const fallbackComponents = ["app-shell", "hero", "bento-grid", "preview-frame", "cinematic-sequence"]
  const requestedComponents = [...new Set(requested.filter(id => allowed.has(id)))]
  const selected = requestedComponents.length ? requestedComponents : fallbackComponents
  const warnings = [
    !selected.includes("app-shell") ? "app_shell_required_for_navigation" : null,
    !selected.includes("preview-frame") ? "preview_required_for_proof" : null,
    !selected.includes("cinematic-sequence") ? "cinematic_sequence_optional" : null,
  ].filter((value): value is string => Boolean(value))
  const qualityScore = Math.max(0, 100 - warnings.length * 15 - (brief.length < 80 ? 10 : 0))
  const blueprintId = crypto.randomUUID()
  return NextResponse.json({ version: "1.1.0", requestId, blueprint: { id: blueprintId, revision: 1, app, preset, brief, components: selected, stages: fallbackStages, generatedAt: new Date().toISOString(), arbitraryHtml: false, quality: { score: qualityScore, warnings, humanReviewRequired: qualityScore < 85 } } }, { status: 201, headers: { ...rateHeaders, "cache-control": "no-store", "x-request-id": requestId } })
}
