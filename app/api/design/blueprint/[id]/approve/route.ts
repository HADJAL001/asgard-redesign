import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintRevisions, saveBlueprint, type StoredBlueprint } from "@/lib/blueprint-store"

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required" }, { status: 415 })
  let body: { revision?: unknown } = {}
  try { body = await request.json() as { revision?: unknown } } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const revision = typeof body.revision === "number" ? body.revision : Number(body.revision)
  if (!Number.isInteger(revision) || revision < 1) return NextResponse.json({ error: "invalid_revision" }, { status: 400 })
  const source = getBlueprint(id, revision)
  const revisions = listBlueprintRevisions(id)
  if (!source || !revisions.length) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  const approved: StoredBlueprint = { ...source, revision: revisions[revisions.length - 1].revision + 1, generatedAt: new Date().toISOString(), approval: { status: "approved", approvedAt: new Date().toISOString() } }
  saveBlueprint(approved)
  return NextResponse.json({ blueprint: approved, approvedRevision: revision }, { status: 201, headers: { "cache-control": "no-store" } })
}
