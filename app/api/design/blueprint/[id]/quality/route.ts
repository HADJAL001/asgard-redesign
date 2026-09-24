import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintEvidence, type BlueprintEvidenceKind } from "@/lib/blueprint-store"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const blueprint = getBlueprint(id)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  const evidence = listBlueprintEvidence(id)
  const latest = new Map(evidence.map((entry) => [entry.kind, entry]))
  const required: BlueprintEvidenceKind[] = ["security"]
  const missing = required.filter((kind) => latest.get(kind)?.contractHash !== blueprint.contractHash || latest.get(kind)?.status !== "passed")
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, contractHash: blueprint.contractHash, approval: blueprint.approval?.status === "approved", required, missing, readyForCodegen: missing.length === 0 && blueprint.approval?.status === "approved", evidence }, { headers: { "cache-control": "no-store" } })
}
