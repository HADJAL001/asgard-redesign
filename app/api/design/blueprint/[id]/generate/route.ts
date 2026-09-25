import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintEvidence, type BlueprintEvidenceKind } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const access = request.cookies.get("osgard_access")?.value
  if (!access) return NextResponse.json({ error: "auth_required" }, { status: 401 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  if (blueprint.approval?.status !== "approved") return NextResponse.json({ error: "blueprint_approval_required" }, { status: 409 })
  const required: BlueprintEvidenceKind[] = ["security", "performance", "a11y", "visual-diff", "deploy"]
  const latest = new Map(listBlueprintEvidence(id, tenantId).map((entry) => [entry.kind, entry]))
  const missing = required.filter((kind) => latest.get(kind)?.revision !== blueprint.revision || latest.get(kind)?.contractHash !== blueprint.contractHash || latest.get(kind)?.status !== "passed")
  if (missing.length) return NextResponse.json({ error: "quality_evidence_required", missing }, { status: 409 })
  if (!blueprint.delivery) return NextResponse.json({ error: "delivery_policy_required" }, { status: 409 })
  if (!BACKEND_URL) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const delivery = blueprint.delivery
  const deliveryBrief = [`Delivery provider: ${delivery.provider}.`, delivery.domain ? `Custom domain: ${delivery.domain}.` : null, delivery.supabaseProjectRef ? `Supabase project ref: ${delivery.supabaseProjectRef}.` : null, delivery.integrationIds?.length ? `Integration IDs: ${delivery.integrationIds.join(", ")}.` : null].filter(Boolean).join(" ")
  const response = await fetch(`${BACKEND_URL}/generate-project`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access}` }, body: JSON.stringify({ name: blueprint.app, description: `${blueprint.brief}\n\nApproved design components: ${blueprint.components.join(", ")}.\n\n${deliveryBrief}` }), signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!response) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const payload = await response.text()
  return new NextResponse(payload, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" } })
}
