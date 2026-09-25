import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintEvidence, getBlueprint, listBlueprintEvidence, type BlueprintEvidence, type BlueprintEvidenceKind, verifyBlueprintEvidenceToken } from "@/lib/blueprint-store"

export const dynamic = "force-dynamic"
const kinds = new Set<BlueprintEvidenceKind>(["typecheck", "unit", "a11y", "security", "performance", "visual-diff", "deploy", "social-preview", "rollback"])
const statuses = new Set(["passed", "failed", "skipped"])

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (!getBlueprint(id)) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ evidence: listBlueprintEvidence(id) }, { headers: { "cache-control": "no-store" } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const blueprint = getBlueprint(id)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const kind = typeof body?.kind === "string" ? body.kind : ""
  const status = typeof body?.status === "string" ? body.status : ""
  const summary = typeof body?.summary === "string" ? body.summary.trim().slice(0, 500) : ""
  const source = typeof body?.source === "string" ? body.source.trim().slice(0, 120) : ""
  const contractHash = typeof body?.contractHash === "string" ? body.contractHash : ""
  const evidenceToken = typeof body?.evidenceToken === "string" ? body.evidenceToken : ""
  if (!kinds.has(kind as BlueprintEvidenceKind) || !statuses.has(status) || !summary || !source || !/^[a-f0-9]{64}$/.test(contractHash)) return NextResponse.json({ error: "invalid_evidence" }, { status: 400 })
  if (!blueprint.contractHash || contractHash !== blueprint.contractHash) return NextResponse.json({ error: "contract_hash_mismatch" }, { status: 409 })
  if (!verifyBlueprintEvidenceToken(id, evidenceToken)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const evidence: BlueprintEvidence = { id: crypto.randomUUID(), blueprintId: id, revision: blueprint.revision, contractHash, kind: kind as BlueprintEvidenceKind, status: status as BlueprintEvidence["status"], summary, capturedAt: new Date().toISOString(), source }
  appendBlueprintEvidence(evidence)
  return NextResponse.json({ evidence }, { status: 201, headers: { "cache-control": "no-store" } })
}
