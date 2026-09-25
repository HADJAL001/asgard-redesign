import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintEvidence, getBlueprint, listBlueprintRevisions, saveBlueprint, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required" }, { status: 415 })
  let body: { revision?: unknown } = {}
  try { body = await request.json() as { revision?: unknown } } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const revision = typeof body.revision === "number" ? body.revision : Number(body.revision)
  if (!Number.isInteger(revision) || revision < 1) return NextResponse.json({ error: "invalid_revision" }, { status: 400 })
  const source = getBlueprint(id, revision, tenantId)
  const revisions = listBlueprintRevisions(id, tenantId)
  if (!source || !revisions.length) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  const rollback: StoredBlueprint = { ...source, revision: revisions[revisions.length - 1].revision + 1, generatedAt: new Date().toISOString() }
  if (!rollback.contractHash) return NextResponse.json({ error: "rollback_contract_hash_missing" }, { status: 500 })
  saveBlueprint(rollback)
  const evidence = appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: rollback.id, tenantId, revision: rollback.revision, contractHash: rollback.contractHash, kind: "rollback", status: "passed", summary: `Revision ${revision} restored as revision ${rollback.revision}; quality gates must be rerun`, capturedAt: new Date().toISOString(), source: "blueprint-rollback" })
  return NextResponse.json({ blueprint: rollback, rolledBackFrom: revision, evidence }, { status: 201, headers: { "cache-control": "no-store" } })
}
