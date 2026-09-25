import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintComment, getBlueprint, listBlueprintComments, verifyBlueprintEvidenceToken } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"
const MAX_BODY_BYTES = 8_000

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ comments: listBlueprintComments(id, tenantId), revision: blueprint.revision }, { headers: { "cache-control": "no-store" } })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return NextResponse.json({ error: "comment_payload_too_large" }, { status: 413 })
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown> } catch { return null } })()
  const revision = Number(body?.revision)
  const blueprint = getBlueprint(id, revision, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body?.evidenceToken, tenantId)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const author = typeof body?.author === "string" ? body.author.trim().slice(0, 80) : "OSGARD collaborator"
  const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 1_000) : ""
  if (comment.length < 2) return NextResponse.json({ error: "comment_too_short" }, { status: 400 })
  const saved = appendBlueprintComment({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision: blueprint.revision, contractHash: blueprint.contractHash || "", author, body: comment, createdAt: new Date().toISOString() })
  return NextResponse.json({ comment: saved }, { status: 201, headers: { "cache-control": "no-store" } })
}
