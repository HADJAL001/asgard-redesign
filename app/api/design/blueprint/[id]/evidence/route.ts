import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintEvidence, getBlueprint, listBlueprintEvidence, type BlueprintEvidence, type BlueprintEvidenceKind, verifyBlueprintEvidenceToken } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"
const kinds = new Set<BlueprintEvidenceKind>(["typecheck", "unit", "a11y", "security", "performance", "visual-diff", "deploy", "social-preview", "rollback"])
const statuses = new Set(["passed", "failed", "skipped"])
const MAX_EVIDENCE_PAYLOAD_BYTES = 16_000

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (!getBlueprint(id, undefined, tenantId)) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ evidence: listBlueprintEvidence(id, tenantId) }, { headers: { "cache-control": "no-store" } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  const rawBody = await request.text()
  if (new TextEncoder().encode(rawBody).byteLength > MAX_EVIDENCE_PAYLOAD_BYTES) return NextResponse.json({ error: "evidence_payload_too_large", maxBytes: MAX_EVIDENCE_PAYLOAD_BYTES }, { status: 413 })
  const body = (() => { try { return JSON.parse(rawBody) as Record<string, unknown> } catch { return null } })()
  const kind = typeof body?.kind === "string" ? body.kind : ""
  const status = typeof body?.status === "string" ? body.status : ""
  const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 500) : ""
  const source = typeof body?.source === "string" ? body.source.trim().slice(0, 120) : ""
  const contractHash = typeof body?.contractHash === "string" ? body.contractHash : ""
  const evidenceToken = typeof body?.evidenceToken === "string" ? body.evidenceToken : ""
  if (!kinds.has(kind as BlueprintEvidenceKind) || !statuses.has(status) || !summary || !source || !/^[a-f0-9]{64}$/.test(contractHash)) return NextResponse.json({ error: "invalid_evidence" }, { status: 400 })
  if (!blueprint.contractHash || contractHash !== blueprint.contractHash) return NextResponse.json({ error: "contract_hash_mismatch" }, { status: 409 })
  if (!verifyBlueprintEvidenceToken(id, evidenceToken, tenantId)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const evidence: BlueprintEvidence = { id: crypto.randomUUID(), blueprintId: id, tenantId, revision: blueprint.revision, contractHash, kind: kind as BlueprintEvidenceKind, status: status as BlueprintEvidence["status"], summary, capturedAt: new Date().toISOString(), source }
  appendBlueprintEvidence(evidence)
  return NextResponse.json({ evidence }, { status: 201, headers: { "cache-control": "no-store" } })
}
