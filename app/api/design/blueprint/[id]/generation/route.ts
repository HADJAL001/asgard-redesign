import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintEvidence, getBlueprint, listBlueprintEvidence, updateBlueprintGeneration, verifyBlueprintEvidenceToken, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"
import { createArtifactSeal } from "@/lib/artifact-seal"

export const dynamic = "force-dynamic"

const statuses = new Set<NonNullable<StoredBlueprint["generation"]>["status"]>(["queued", "processing", "completed", "failed", "cancelled"])
const MAX_GENERATION_PAYLOAD_BYTES = 16_000
const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

function safeResult(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : null
  if (!raw) return undefined
  const result = {
    ...(typeof raw.appUrl === "string" && /^https?:\/\//.test(raw.appUrl) ? { appUrl: raw.appUrl.slice(0, 500) } : {}),
    ...(typeof raw.previewUrl === "string" && /^https?:\/\//.test(raw.previewUrl) ? { previewUrl: raw.previewUrl.slice(0, 500) } : {}),
    ...(typeof raw.repoUrl === "string" && /^https?:\/\//.test(raw.repoUrl) ? { repoUrl: raw.repoUrl.slice(0, 500) } : {}),
  }
  return Object.keys(result).length ? result : undefined
}

function safeSandbox(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : null
  if (!raw) return undefined
  const exitCode = raw.exitCode === null ? null : Number(raw.exitCode)
  const durationMs = Number(raw.durationMs)
  if ((exitCode !== null && !Number.isInteger(exitCode)) || !Number.isFinite(durationMs) || durationMs < 0) return undefined
  const timedOut = raw.timedOut === true
  const status = raw.status === "passed" || raw.status === "failed" || raw.status === "timeout" || raw.status === "unavailable"
    ? raw.status
    : timedOut ? "timeout" : exitCode === 0 ? "passed" : "failed"
  const rawLog = typeof raw.stderr === "string" ? raw.stderr : typeof raw.stdout === "string" ? raw.stdout : ""
  const logTail = rawLog.replace(/[\r\n\t]+/g, " ").replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(-800)
  return { status, exitCode, timedOut, durationMs: Math.round(durationMs), ...(logTail ? { logTail } : {}) } as NonNullable<StoredBlueprint["generation"]>["sandbox"]
}

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
  const access = request.cookies.get("osgard_access")?.value
  if (!access) return NextResponse.json({ error: "auth_required" }, { status: 401 })
  const status = body?.status as NonNullable<StoredBlueprint["generation"]>["status"]
  const taskId = typeof body?.taskId === "string" ? body.taskId.slice(0, 160) : ""
  const progress = Number(body?.progress)
  if (!taskId || !statuses.has(status) || !Number.isFinite(progress)) return NextResponse.json({ error: "invalid_generation_state" }, { status: 400 })
  if (blueprint.generation?.taskId && blueprint.generation.taskId !== taskId) return NextResponse.json({ error: "generation_task_conflict" }, { status: 409 })
  let result = safeResult(body?.result)
  let sandbox = safeSandbox(body?.sandbox)
  if (status === "completed") {
    if (!BACKEND_URL) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
    const taskResponse = await fetch(`${BACKEND_URL}/task/${encodeURIComponent(taskId)}`, { headers: { authorization: `Bearer ${access}` }, cache: "no-store", signal: AbortSignal.timeout(10_000) }).catch(() => null)
    const task = taskResponse?.ok ? await taskResponse.json().catch(() => null) : null
    if (task?.status !== "completed") return NextResponse.json({ error: "generation_completion_not_verified" }, { status: 409 })
    result = safeResult(task.result)
    sandbox = safeSandbox(task.sandbox)
  }
  const artifactSeal = status === "completed" && result && Object.keys(result).length
    ? createArtifactSeal({ blueprintId: id, tenantId, revision, contractHash: blueprint.contractHash || "", taskId, result })
    : null
  const generation: NonNullable<StoredBlueprint["generation"]> = { taskId, status, progress: Math.min(100, Math.max(0, Math.round(progress))), ...(typeof body?.currentStep === "string" ? { currentStep: body.currentStep.slice(0, 160) } : {}), ...(typeof body?.error === "string" ? { error: body.error.slice(0, 500) } : {}), ...(result && Object.keys(result).length ? { result } : {}), ...(sandbox ? { sandbox } : {}), ...(artifactSeal ? { artifactSeal } : {}), updatedAt: new Date().toISOString() }
  updateBlueprintGeneration(id, revision, generation, tenantId)
  if (artifactSeal) {
    const summary = `Generation artifact sealed (${artifactSeal.digest.slice(0, 12)}…)`
    const alreadyRecorded = listBlueprintEvidence(id, tenantId).some((entry) => entry.kind === "artifact-signature" && entry.revision === revision && entry.summary === summary)
    if (!alreadyRecorded) appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision, contractHash: blueprint.contractHash || "", kind: "artifact-signature", status: "passed", summary, capturedAt: artifactSeal.signedAt, source: "generation-artifact-seal" })
  }
  const updated = getBlueprint(id, revision, tenantId)
  return NextResponse.json({ blueprintId: id, revision, generation, sealStatus: artifactSeal ? "signed" : status === "completed" ? "unavailable" : "not_applicable", history: updated?.generationHistory || [generation] }, { status: 201, headers: { "cache-control": "no-store" } })
}
