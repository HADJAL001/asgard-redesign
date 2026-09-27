import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendBlueprintEvidence, getBlueprint, listBlueprintEvidence, verifyBlueprintEvidenceToken } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"
import { verifyDeliveryAdapters, verifyDeliveryDomain, verifySupabaseProject } from "@/lib/delivery-adapters"
import { observeProductMemory, shadowProductMemory } from "@/lib/product-memory-shadow"
import { requireBlueprintActor } from "@/lib/blueprint-auth"

export const dynamic = "force-dynamic"

type Check = { id: string; status: "passed" | "failed" | "manual" | "not-requested"; label: string }

async function verifyIntegrations(ids: number[], requiredConnectorIds: string[], request: NextRequest): Promise<Check> {
  if (!ids.length && !requiredConnectorIds.length) return { id: "integrations", status: "not-requested", label: "No infrastructure adapters selected" }
  const access = request.cookies.get("osgard_access")?.value
  const check = await verifyDeliveryAdapters(ids, access, requiredConnectorIds)
  return { id: "integrations", status: check.ready ? "passed" : "failed", label: check.label }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const actor = await requireBlueprintActor(request)
  if ("error" in actor) return NextResponse.json({ error: actor.error }, { status: actor.error === "auth_required" ? 401 : 503 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const revision = Number(body?.revision)
  const blueprint = getBlueprint(id, Number.isInteger(revision) && revision > 0 ? revision : undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body?.evidenceToken, tenantId)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const checks: Check[] = [{ id: "provider", status: blueprint.delivery ? "passed" : "failed", label: blueprint.delivery ? `${blueprint.delivery.provider} target recorded` : "Delivery target is missing" }]
  const integrationIds = blueprint.delivery?.integrationIds || []
  const access = request.cookies.get("osgard_access")?.value
  if (blueprint.delivery?.domain) {
    const check = await verifyDeliveryDomain(blueprint.delivery.domain, integrationIds, access)
    checks.push({ id: "domain", status: check.ready ? "passed" : "failed", label: check.label })
  }
  else checks.push({ id: "domain", status: "not-requested", label: "Custom domain not requested" })
  if (blueprint.delivery?.supabaseProjectRef) {
    const check = await verifySupabaseProject(blueprint.delivery.supabaseProjectRef, integrationIds, access)
    checks.push({ id: "supabase", status: check.ready ? "passed" : "failed", label: check.label })
  }
  else checks.push({ id: "supabase", status: "not-requested", label: "Supabase project not requested" })
  const requiredConnectorIds = [
    ...(blueprint.delivery?.domain ? ["cloudflare"] : []),
    ...(blueprint.delivery?.supabaseProjectRef ? ["supabase-management"] : []),
  ]
  checks.push(await verifyIntegrations(integrationIds, requiredConnectorIds, request))
  const recorded = listBlueprintEvidence(id, tenantId)
  const capturedEvidence = []
  for (const check of checks.filter((item) => item.id === "domain" || item.id === "supabase" || item.id === "integrations")) {
    if (check.status === "not-requested") continue
    const kind = check.id === "domain" ? "dns-verification" : check.id === "supabase" ? "supabase-verification" : "integration-verification"
    const status = check.status === "passed" ? "passed" : check.status === "failed" ? "failed" : "skipped"
    const summary = check.label
    const exists = recorded.some((entry) => entry.kind === kind && entry.revision === blueprint.revision && entry.status === status && entry.summary === summary)
    if (!exists) capturedEvidence.push(appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision: blueprint.revision, contractHash: blueprint.contractHash || "", kind, status, summary, capturedAt: new Date().toISOString(), source: "delivery-read-only-verification" }))
  }
  if (capturedEvidence.length) {
    await shadowProductMemory(request, blueprint, capturedEvidence)
    await observeProductMemory(request, blueprint, capturedEvidence)
  }
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, verifiedAt: new Date().toISOString(), checks, ready: checks.every((check) => check.status === "passed" || check.status === "not-requested") }, { headers: { "cache-control": "no-store" } })
}
