import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintEvidence, type BlueprintEvidenceKind } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  const evidence = listBlueprintEvidence(id, tenantId)
  const latest = new Map(evidence.map((entry) => [entry.kind, entry]))
  const required: BlueprintEvidenceKind[] = ["security", "performance", "a11y", "visual-diff", "deploy"]
  const missing = required.filter((kind) => latest.get(kind)?.revision !== blueprint.revision || latest.get(kind)?.contractHash !== blueprint.contractHash || latest.get(kind)?.status !== "passed")
  const stale = missing.map((kind) => {
    const entry = latest.get(kind)
    const reason = !entry ? "missing" : entry.revision !== blueprint.revision ? "revision" : entry.contractHash !== blueprint.contractHash ? "contract" : entry.status !== "passed" ? entry.status : "unknown"
    return { kind, reason, revision: entry?.revision, expectedRevision: blueprint.revision }
  })
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, contractHash: blueprint.contractHash, approval: blueprint.approval?.status === "approved", required, missing, stale, readyForCodegen: missing.length === 0 && blueprint.approval?.status === "approved", evidence }, { headers: { "cache-control": "no-store" } })
}
