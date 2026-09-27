import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintEvidence, type BlueprintEvidenceKind } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"
import { verifyDeliveryAdapters } from "@/lib/delivery-adapters"
import { signProductContract } from "@/lib/product-contract-attestation"
import { buildProductContractRequirements } from "@/lib/product-contract-requirements"

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
  if (!blueprint.contractHash) return NextResponse.json({ error: "blueprint_contract_hash_missing" }, { status: 409 })
  if (blueprint.approval?.status !== "approved") return NextResponse.json({ error: "blueprint_approval_required" }, { status: 409 })
  const required: BlueprintEvidenceKind[] = ["security", "performance", "a11y", "visual-diff", "deploy"]
  const latest = new Map(listBlueprintEvidence(id, tenantId).map((entry) => [entry.kind, entry]))
  const missing = required.filter((kind) => latest.get(kind)?.revision !== blueprint.revision || latest.get(kind)?.contractHash !== blueprint.contractHash || latest.get(kind)?.status !== "passed")
  if (missing.length) return NextResponse.json({ error: "quality_evidence_required", missing }, { status: 409 })
  if (!blueprint.delivery) return NextResponse.json({ error: "delivery_policy_required" }, { status: 409 })
  const deliveryEvidence: BlueprintEvidenceKind[] = [
    ...(blueprint.delivery.domain ? ["dns-verification" as const] : []),
    ...(blueprint.delivery.supabaseProjectRef ? ["supabase-verification" as const] : []),
    ...(blueprint.delivery.integrationIds?.length ? ["integration-verification" as const] : []),
  ]
  const missingDelivery = deliveryEvidence.filter((kind) => latest.get(kind)?.revision !== blueprint.revision || latest.get(kind)?.contractHash !== blueprint.contractHash || latest.get(kind)?.status !== "passed")
  if (missingDelivery.length) return NextResponse.json({ error: "delivery_verification_required", missing: missingDelivery }, { status: 409 })
  const adapters = await verifyDeliveryAdapters(blueprint.delivery.integrationIds || [], access, [
    ...(blueprint.delivery.domain ? ["cloudflare"] : []),
    ...(blueprint.delivery.supabaseProjectRef ? ["supabase-management"] : []),
  ])
  if (!adapters.ready) return NextResponse.json({ error: "delivery_adapter_recheck_required", message: adapters.label }, { status: 409 })
  if (!BACKEND_URL) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const delivery = blueprint.delivery
  const deliveryBrief = [`Delivery provider: ${delivery.provider}.`, delivery.domain ? `Custom domain: ${delivery.domain}.` : null, delivery.supabaseProjectRef ? `Supabase project ref: ${delivery.supabaseProjectRef}.` : null, delivery.integrationIds?.length ? `Integration IDs: ${delivery.integrationIds.join(", ")}.` : null].filter(Boolean).join(" ")
  const requirements = buildProductContractRequirements({
    blueprintId: blueprint.id,
    revision: blueprint.revision,
    contractHash: blueprint.contractHash,
    outcome: blueprint.intent?.outcome,
    brief: blueprint.brief || blueprint.app,
    constraints: blueprint.intent?.constraints,
    components: blueprint.components,
  })
  const unsignedProductContract = {
    version: "1.0.0",
    source: { blueprintId: blueprint.id, tenantId, revision: blueprint.revision, contractHash: blueprint.contractHash },
    brief: blueprint.brief,
    contract: {
      version: blueprint.contractVersion || "1.0.0",
      productType: blueprint.productType,
      designDNA: { preset: blueprint.preset, tokens: {} },
      workflows: [{
        id: "primary-outcome",
        actor: (blueprint.intent?.audience || "product user").slice(0, 120),
        success: (blueprint.intent?.outcome || blueprint.brief).slice(0, 500),
        risk: blueprint.aiPlan?.risks.length ? "medium" : "low",
      }],
      requirements,
      gates: ["typecheck", "unit", "a11y", "security", "performance", "visual-diff"],
      provenance: { sourceMemoryIds: [], createdBy: "ai-cofounder" },
    },
    storyboard: { components: blueprint.components },
    architecture: blueprint.aiPlan ? { summary: blueprint.aiPlan.summary, risks: blueprint.aiPlan.risks } : undefined,
  }
  const attestation = signProductContract(unsignedProductContract)
  if (!attestation) return NextResponse.json({ error: "product_contract_attestation_unavailable" }, { status: 503 })
  const productContract = { ...unsignedProductContract, attestation }
  const response = await fetch(`${BACKEND_URL}/generate-project`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access}` }, body: JSON.stringify({ name: blueprint.app, description: deliveryBrief, productContract, delivery }), signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!response) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const payload = await response.text()
  return new NextResponse(payload, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" } })
}
