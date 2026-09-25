import { NextRequest, NextResponse } from "next/server"
import { getBlueprintGraph } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const graph = getBlueprintGraph(id, tenantId)
  if (!graph) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ graph }, { headers: { "cache-control": "no-store" } })
}
