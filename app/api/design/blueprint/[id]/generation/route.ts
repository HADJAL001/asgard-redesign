import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, updateBlueprintGeneration, verifyBlueprintEvidenceToken, type StoredBlueprint } from "@/lib/blueprint-store"

export const dynamic = "force-dynamic"

const statuses = new Set<NonNullable<StoredBlueprint["generation"]>["status"]>(["queued", "processing", "completed", "failed", "cancelled"])
const MAX_GENERATION_PAYLOAD_BYTES = 16_000

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const blueprint = getBlueprint(id)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, generation: blueprint.generation || null }, { headers: { "cache-control": "no-store" } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_GENERATION_PAYLOAD_BYTES) return NextResponse.json({ error: "generation_payload_too_large", maxBytes: MAX_GENERATION_PAYLOAD_BYTES }, { status: 413 })
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown> } catch { return null } })()
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  const revision = Number(body?.revision)
  const blueprint = getBlueprint(id, revision)
  if (!blueprint) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body?.evidenceToken)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const status = body?.status as NonNullable<StoredBlueprint["generation"]>["status"]
  const taskId = typeof body?.taskId === "string" ? body.taskId.slice(0, 160) : ""
  const progress = Number(body?.progress)
  if (!taskId || !statuses.has(status) || !Number.isFinite(progress)) return NextResponse.json({ error: "invalid_generation_state" }, { status: 400 })
  const rawResult = body?.result && typeof body.result === "object" ? body.result as Record<string, unknown> : null
  const result = rawResult ? {
    ...(typeof rawResult.appUrl === "string" && /^https?:\/\//.test(rawResult.appUrl) ? { appUrl: rawResult.appUrl.slice(0, 500) } : {}),
    ...(typeof rawResult.previewUrl === "string" && /^https?:\/\//.test(rawResult.previewUrl) ? { previewUrl: rawResult.previewUrl.slice(0, 500) } : {}),
    ...(typeof rawResult.repoUrl === "string" && /^https?:\/\//.test(rawResult.repoUrl) ? { repoUrl: rawResult.repoUrl.slice(0, 500) } : {}),
  } : undefined
  const generation: NonNullable<StoredBlueprint["generation"]> = { taskId, status, progress: Math.min(100, Math.max(0, Math.round(progress))), ...(typeof body?.currentStep === "string" ? { currentStep: body.currentStep.slice(0, 160) } : {}), ...(typeof body?.error === "string" ? { error: body.error.slice(0, 500) } : {}), ...(result && Object.keys(result).length ? { result } : {}), updatedAt: new Date().toISOString() }
  updateBlueprintGeneration(id, revision, generation)
  return NextResponse.json({ blueprintId: id, revision, generation }, { status: 201, headers: { "cache-control": "no-store" } })
}
