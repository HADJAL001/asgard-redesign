import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintEvidence, getBlueprint, listBlueprintEvidence, updateBlueprintGeneration, verifyBlueprintEvidenceToken, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"
import { createArtifactSeal } from "@/lib/artifact-seal"

export const dynamic = "force-dynamic"

const statuses = new Set<NonNullable<StoredBlueprint["generation"]>["status"]>(["queued", "processing", "completed", "failed", "cancelled"])
const MAX_GENERATION_PAYLOAD_BYTES = 16_000

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, generation: blueprint.generation || null, history: blueprint.generationHistory || [] }, { headers: { "cache-control": "no-store" } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_GENERATION_PAYLOAD_BYTES) return NextResponse.json({ error: "generation_payload_too_large", maxBytes: MAX_GENERATION_PAYLOAD_BYTES }, { status: 413 })
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown> } catch { return null } })()
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  const revision = Number(body?.revision)
  const blueprint = getBlueprint(id, revision, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body?.evidenceToken, tenantId)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const status = body?.status as NonNullable<StoredBlueprint["generation"]>["status"]
  const taskId = typeof body?.taskId === "string" ? body.taskId.slice(0, 160) : ""
  const progress = Number(body?.progress)
  if (!taskId || !statuses.has(status) || !Number.isFinite(progress)) return NextResponse.json({ error: "invalid_generation_state" }, { status: 400 })
  if (blueprint.generation?.taskId && blueprint.generation.taskId !== taskId) return NextResponse.json({ error: "generation_task_conflict" }, { status: 409 })
  const rawResult = body?.result && typeof body.result === "object" ? body.result as Record<string, unknown> : null
  const result = rawResult ? {
    ...(typeof rawResult.appUrl === "string" && /^https?:\/\//.test(rawResult.appUrl) ? { appUrl: rawResult.appUrl.slice(0, 500) } : {}),
    ...(typeof rawResult.previewUrl === "string" && /^https?:\/\//.test(rawResult.previewUrl) ? { previewUrl: rawResult.previewUrl.slice(0, 500) } : {}),
    ...(typeof rawResult.repoUrl === "string" && /^https?:\/\//.test(rawResult.repoUrl) ? { repoUrl: rawResult.repoUrl.slice(0, 500) } : {}),
  } : undefined
  const artifactSeal = status === "completed" && result && Object.keys(result).length
    ? createArtifactSeal({ blueprintId: id, tenantId, revision, contractHash: blueprint.contractHash || "", taskId, result })
    : null
  const generation: NonNullable<StoredBlueprint["generation"]> = { taskId, status, progress: Math.min(100, Math.max(0, Math.round(progress))), ...(typeof body?.currentStep === "string" ? { currentStep: body.currentStep.slice(0, 160) } : {}), ...(typeof body?.error === "string" ? { error: body.error.slice(0, 500) } : {}), ...(result && Object.keys(result).length ? { result } : {}), ...(artifactSeal ? { artifactSeal } : {}), updatedAt: new Date().toISOString() }
  updateBlueprintGeneration(id, revision, generation, tenantId)
  if (artifactSeal) {
    const summary = `Generation artifact sealed (${artifactSeal.digest.slice(0, 12)}…)`
    const alreadyRecorded = listBlueprintEvidence(id, tenantId).some((entry) => entry.kind === "artifact-signature" && entry.revision === revision && entry.summary === summary)
    if (!alreadyRecorded) appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision, contractHash: blueprint.contractHash || "", kind: "artifact-signature", status: "passed", summary, capturedAt: artifactSeal.signedAt, source: "generation-artifact-seal" })
  }
  const updated = getBlueprint(id, revision, tenantId)
  return NextResponse.json({ blueprintId: id, revision, generation, sealStatus: artifactSeal ? "signed" : status === "completed" ? "unavailable" : "not_applicable", history: updated?.generationHistory || [generation] }, { status: 201, headers: { "cache-control": "no-store" } })
}
