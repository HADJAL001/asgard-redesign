import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintRevisions, saveBlueprint, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"
import { requireBlueprintActor } from "@/lib/blueprint-auth"
import { observeProductMemory, shadowProductMemory } from "@/lib/product-memory-shadow"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const actor = await requireBlueprintActor(request)
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.error === "auth_required" ? 401 : 503 })
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required" }, { status: 415 })
  let body: { revision?: unknown } = {}
  try { body = await request.json() as { revision?: unknown } } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const revision = typeof body.revision === "number" ? body.revision : Number(body.revision)
  if (!Number.isInteger(revision) || revision < 1) return NextResponse.json({ error: "invalid_revision" }, { status: 400 })
  const source = getBlueprint(id, revision, tenantId)
  const revisions = listBlueprintRevisions(id, tenantId)
  if (!source || !revisions.length) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  const approved: StoredBlueprint = { ...source, revision: revisions[revisions.length - 1].revision + 1, generatedAt: new Date().toISOString(), approval: { status: "approved", approvedAt: new Date().toISOString() } }
  saveBlueprint(approved)
  // Approval is a valid new lifecycle revision even when its contract payload
  // has not changed. Persist the revision in the shadow ledger before any
  // future read cutover; the file store remains authoritative today.
  await shadowProductMemory(request, approved, [])
  await observeProductMemory(request, approved, [])
  return NextResponse.json({ blueprint: approved, approvedRevision: revision }, { status: 201, headers: { "cache-control": "no-store" } })
}
