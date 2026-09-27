import type { StoredBlueprint, BlueprintEvidence } from "@/lib/blueprint-store"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

/** Shadow writing is feature-flagged on the backend; failures never block a blueprint. */
export async function shadowProductMemory(request: Request, blueprint: StoredBlueprint, evidence: BlueprintEvidence[]) {
  if (process.env.OSGARD_PRODUCT_SHADOW_WRITE !== "true") return
  const access = request.headers.get("cookie")?.match(/(?:^|;\s*)osgard_access=([^;]+)/)?.[1]
  if (!BACKEND_URL || !access) return
  await fetch(`${BACKEND_URL}/design/product-memory/shadow`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${decodeURIComponent(access)}` },
    body: JSON.stringify({
      tenantId: blueprint.tenantId || "osgardnewworld",
      blueprint: {
        id: blueprint.id, revision: blueprint.revision, contractVersion: blueprint.contractVersion || "1.0.0", contractHash: blueprint.contractHash || "", app: blueprint.app, productType: blueprint.productType, preset: blueprint.preset, brief: blueprint.brief, intent: blueprint.intent, components: blueprint.components, generatedAt: blueprint.generatedAt,
        delivery: blueprint.delivery,
      },
      evidence,
    }),
    signal: AbortSignal.timeout(1_500),
    cache: "no-store",
  }).catch(() => undefined)
}

/**
 * A disabled-by-default observer for the migration window. The file Blueprint
 * Store remains the sole response source regardless of the result.
 */
export async function observeProductMemory(request: Request, blueprint: StoredBlueprint, evidence: BlueprintEvidence[]) {
  if (process.env.OSGARD_PRODUCT_DUAL_READ !== "true") return
  const access = request.headers.get("cookie")?.match(/(?:^|;\s*)osgard_access=([^;]+)/)?.[1]
  if (!BACKEND_URL || !access) return
  await fetch(`${BACKEND_URL}/design/product-memory/observe`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${decodeURIComponent(access)}` },
    body: JSON.stringify({
      tenantId: blueprint.tenantId || "osgardnewworld",
      blueprint: { id: blueprint.id, revision: blueprint.revision, contractHash: blueprint.contractHash || "" },
      evidenceIds: evidence.map((entry) => entry.id),
    }),
    signal: AbortSignal.timeout(1_000),
    cache: "no-store",
  }).catch(() => undefined)
}
