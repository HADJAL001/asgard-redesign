import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, updateBlueprintDelivery, verifyBlueprintEvidenceToken, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"
const providers = new Set<NonNullable<StoredBlueprint["delivery"]>["provider"]>(["osgard-cluster", "vercel", "netlify", "custom"])

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const revision = Number(request.nextUrl.searchParams.get("revision"))
  const blueprint = getBlueprint(id, Number.isInteger(revision) && revision > 0 ? revision : undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, delivery: blueprint.delivery || null }, { headers: { "cache-control": "no-store" } })
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const revision = Number(body?.revision)
  const blueprint = getBlueprint(id, revision, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body?.evidenceToken, tenantId)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const provider = body?.provider as NonNullable<StoredBlueprint["delivery"]>["provider"]
  if (!providers.has(provider)) return NextResponse.json({ error: "invalid_delivery_provider" }, { status: 400 })
  const domain = typeof body?.domain === "string" ? body.domain.trim().toLowerCase() : ""
  if (domain && (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain))) return NextResponse.json({ error: "invalid_delivery_domain" }, { status: 400 })
  const supabaseProjectRef = typeof body?.supabaseProjectRef === "string" ? body.supabaseProjectRef.trim().slice(0, 80) : ""
  const integrationIds = Array.isArray(body?.integrationIds) ? [...new Set(body.integrationIds.filter((value): value is number => Number.isInteger(value) && value > 0))].slice(0, 12) : []
  const delivery: NonNullable<StoredBlueprint["delivery"]> = { provider, ...(domain ? { domain } : {}), ...(supabaseProjectRef ? { supabaseProjectRef } : {}), ...(integrationIds.length ? { integrationIds } : {}), updatedAt: new Date().toISOString() }
  const updated = updateBlueprintDelivery(id, revision, delivery, tenantId)
  return NextResponse.json({ blueprintId: id, revision, delivery: updated?.delivery || delivery }, { status: 200, headers: { "cache-control": "no-store" } })
}
