import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintRevisions } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const revisionParam = request.nextUrl.searchParams.get("revision")
  const revision = revisionParam ? Number(revisionParam) : undefined
  if (revisionParam && (!Number.isInteger(revision) || revision! < 1)) return NextResponse.json({ error: "invalid_revision" }, { status: 400 })
  const blueprint = getBlueprint(id, revision, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ blueprint, revisions: listBlueprintRevisions(id, tenantId).map(({ revision: value, generatedAt }) => ({ revision: value, generatedAt })) }, { headers: { "cache-control": "no-store" } })
}
