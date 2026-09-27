import { Pool, type PoolClient } from "pg"

type ShadowEvidence = {
  id: string
  revision: number
  contractHash: string
  kind: string
  status: "passed" | "failed" | "skipped"
  summary: string
  source: string
  capturedAt: string
}

export type ProductMemoryShadowInput = {
  tenantId: string
  blueprint: {
    id: string
    revision: number
    contractVersion: string
    contractHash: string
    app: string
    productType?: string
    preset: string
    brief: string
    intent?: unknown
    components: string[]
    generatedAt: string
    delivery?: { provider: string; domain?: string; supabaseProjectRef?: string; integrationIds?: number[]; updatedAt: string }
  }
  evidence: ShadowEvidence[]
}

export type ProductMemoryObservationInput = {
  tenantId: string
  blueprint: Pick<ProductMemoryShadowInput["blueprint"], "id" | "revision" | "contractHash">
  evidenceIds: string[]
}

let pool: Pool | null = null

export function isProductMemoryShadowEnabled() {
  return process.env.OSGARD_PRODUCT_SHADOW_WRITE === "true" && Boolean(process.env.OSGARD_PRODUCT_POSTGRES_URL)
}

/**
 * Observation is intentionally independent of the write switch. It may be
 * enabled only after shadow-write reconciliation is proven, and never becomes
 * a response source for the product flow.
 */
export function isProductMemoryObservationEnabled() {
  return process.env.OSGARD_PRODUCT_DUAL_READ === "true" && Boolean(process.env.OSGARD_PRODUCT_POSTGRES_URL)
}

function clientPool() {
  if (!pool) pool = new Pool({ connectionString: process.env.OSGARD_PRODUCT_POSTGRES_URL, max: 4, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 1_000 })
  return pool
}

async function writeGraphNode(client: PoolClient, tenantId: string, id: string, blueprintId: string, kind: "idea" | "contract" | "evidence" | "delivery", label: string, revision: number, status: string | null, contractHash: string | null, occurredAt: string) {
  await client.query(
    `INSERT INTO osgard_product.product_graph_nodes (id, tenant_id, blueprint_id, kind, label, revision, status, contract_hash, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (id) DO NOTHING`,
    [id, tenantId, blueprintId, kind, label, revision, status, contractHash, occurredAt],
  )
}

/**
 * Best-effort dual write used only after the Product OS migration has been
 * explicitly provisioned. The current blueprint store remains the read source
 * until reconciliation proves zero divergence.
 */
export async function shadowProductMemory(tenantId: string, input: ProductMemoryShadowInput) {
  if (!isProductMemoryShadowEnabled()) return { status: "disabled" as const }
  const client = await clientPool().connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT set_config('osgard.tenant_id', $1, true)", [tenantId])
    await client.query(
      `INSERT INTO osgard_product.tenants (tenant_id, display_name) VALUES ($1, $2)
       ON CONFLICT (tenant_id) DO NOTHING`,
      [tenantId, tenantId],
    )
    const contract = input.blueprint
    const contractPayload = {
      version: contract.contractVersion,
      app: contract.app,
      productType: contract.productType ?? "application",
      preset: contract.preset,
      brief: contract.brief,
      intent: contract.intent ?? null,
      components: contract.components,
    }
    const result = await client.query<{ id: string }>(
      `INSERT INTO osgard_product.product_contracts
       (tenant_id, blueprint_id, revision, contract_version, contract_hash, contract, provenance)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, blueprint_id, revision) DO NOTHING
       RETURNING id`,
      [tenantId, contract.id, contract.revision, contract.contractVersion, contract.contractHash, contractPayload, { source: "blueprint-store-shadow", capturedAt: contract.generatedAt }],
    )
    const contractId = result.rows[0]?.id ?? (await client.query<{ id: string }>(
      `SELECT id FROM osgard_product.product_contracts WHERE tenant_id = $1 AND blueprint_id = $2 AND revision = $3`,
      [tenantId, contract.id, contract.revision],
    )).rows[0]?.id
    if (!contractId) throw new Error("product_contract_not_persisted")
    const contractNodeId = `contract:${contract.id}:${contract.revision}`
    await writeGraphNode(client, tenantId, contractNodeId, contract.id, "contract", `ProductContract v${contract.revision}`, contract.revision, null, contract.contractHash, contract.generatedAt)
    if (contract.delivery) {
      const deliveryNodeId = `delivery:${contract.id}:${contract.revision}:${contract.delivery.updatedAt}`
      await writeGraphNode(client, tenantId, deliveryNodeId, contract.id, "delivery", contract.delivery.provider, contract.revision, null, contract.contractHash, contract.delivery.updatedAt)
      await client.query(
        `INSERT INTO osgard_product.product_graph_edges (id, tenant_id, from_node_id, to_node_id, kind)
         VALUES ($1,$2,$3,$4,'delivered_to') ON CONFLICT (id) DO NOTHING`,
        [`${contractNodeId}->${deliveryNodeId}`, tenantId, contractNodeId, deliveryNodeId],
      )
    }
    for (const evidence of input.evidence) {
      await client.query(
        `INSERT INTO osgard_product.evidence_ledger
         (id, tenant_id, contract_id, revision, kind, status, summary, source, provenance, captured_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [evidence.id, tenantId, contractId, evidence.revision, evidence.kind, evidence.status, evidence.summary, evidence.source, { contractHash: evidence.contractHash, source: "blueprint-store-shadow" }, evidence.capturedAt],
      )
      const evidenceNodeId = `evidence:${evidence.id}`
      await writeGraphNode(client, tenantId, evidenceNodeId, contract.id, "evidence", evidence.kind, evidence.revision, evidence.status, evidence.contractHash, evidence.capturedAt)
      await client.query(
        `INSERT INTO osgard_product.product_graph_edges (id, tenant_id, from_node_id, to_node_id, kind)
         VALUES ($1,$2,$3,$4,'verified_by') ON CONFLICT (id) DO NOTHING`,
        [`${contractNodeId}->${evidenceNodeId}`, tenantId, contractNodeId, evidenceNodeId],
      )
    }
    await client.query("COMMIT")
    return { status: "written" as const }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/** Read-only comparison primitive for the later dual-read observation window. */
export async function observeProductMemory(tenantId: string, input: ProductMemoryObservationInput) {
  if (!isProductMemoryObservationEnabled()) return { status: "disabled" as const }
  const client = await clientPool().connect()
  try {
    await client.query("BEGIN READ ONLY")
    await client.query("SELECT set_config('osgard.tenant_id', $1, true)", [tenantId])
    const contract = await client.query<{ contract_hash: string }>(
      `SELECT contract_hash FROM osgard_product.product_contracts
       WHERE tenant_id = $1 AND blueprint_id = $2 AND revision = $3`,
      [tenantId, input.blueprint.id, input.blueprint.revision],
    )
    const evidence = input.evidenceIds.length
      ? await client.query<{ id: string }>(
        `SELECT id FROM osgard_product.evidence_ledger
         WHERE tenant_id = $1 AND contract_id = (
           SELECT id FROM osgard_product.product_contracts
           WHERE tenant_id = $1 AND blueprint_id = $2 AND revision = $3
         ) AND id = ANY($4::uuid[])`,
        [tenantId, input.blueprint.id, input.blueprint.revision, input.evidenceIds],
      )
      : { rows: [] as Array<{ id: string }> }
    await client.query("COMMIT")
    const matchedEvidenceIds = new Set(evidence.rows.map((row) => row.id))
    return {
      status: "observed" as const,
      contractPresent: contract.rows.length === 1,
      contractHashMatches: contract.rows[0]?.contract_hash === input.blueprint.contractHash,
      missingEvidenceIds: input.evidenceIds.filter((id) => !matchedEvidenceIds.has(id)),
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
