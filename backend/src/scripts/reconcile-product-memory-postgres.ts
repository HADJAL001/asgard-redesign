import fs from "node:fs"
import path from "node:path"
import { Client } from "pg"

type Blueprint = {
  id: string
  tenantId?: string
  revision: number
  contractHash?: string
  contractVersion?: string
  app: string
  productType?: string
  preset: string
  brief: string
  intent?: unknown
  components: string[]
  generatedAt: string
  delivery?: { provider: string; updatedAt: string }
}
type Evidence = { id: string; blueprintId: string; tenantId?: string; revision: number; contractHash: string; kind: string; status: string; summary: string; source: string; capturedAt: string }

export type ReconciliationReport = {
  checkedAt: string
  source: { blueprints: number; revisions: number; evidence: number }
  postgres: { contracts: number; evidence: number; nodes: number; edges: number }
  divergence: { missingContracts: string[]; hashMismatches: string[]; missingEvidence: string[]; missingNodes: string[]; missingEdges: string[]; extras: string[] }
  ok: boolean
}

const defaultTenant = "osgardnewworld"
const readObject = <T extends object>(file: string): T => {
  for (const candidate of [file, `${file}.bak`]) {
    try {
      const value = JSON.parse(fs.readFileSync(candidate, "utf8"))
      if (value && typeof value === "object" && !Array.isArray(value)) return value as T
    } catch { /* durable backup is the fallback */ }
  }
  return {} as T
}

function sourceRecords() {
  const root = process.env.BLUEPRINT_STORE_PATH || path.join(process.cwd(), ".data", "blueprints.json")
  const evidencePath = process.env.BLUEPRINT_EVIDENCE_PATH || path.join(process.cwd(), ".data", "blueprint-evidence.json")
  const raw = readObject<Record<string, Blueprint[]>>(root)
  const evidence = readObject<Record<string, Evidence[]>>(evidencePath)
  const revisions = Object.values(raw).flat().filter((item) => item && typeof item.id === "string" && Number.isInteger(item.revision))
  const entries = Object.values(evidence).flat().filter((item) => item && typeof item.id === "string")
  return { revisions, entries }
}

function expectedGraph(revisions: Blueprint[], entries: Evidence[]) {
  const nodes = new Set<string>(), edges = new Set<string>()
  for (const revision of revisions) {
    const tenant = revision.tenantId || defaultTenant
    const contract = `contract:${revision.id}:${revision.revision}`
    nodes.add(`${tenant}|${contract}`)
    if (revision.delivery) {
      const delivery = `delivery:${revision.id}:${revision.revision}:${revision.delivery.updatedAt}`
      nodes.add(`${tenant}|${delivery}`)
      edges.add(`${tenant}|${contract}->${delivery}`)
    }
    for (const item of entries.filter((entry) => entry.blueprintId === revision.id && entry.revision === revision.revision && (entry.tenantId || defaultTenant) === tenant)) {
      const evidence = `evidence:${item.id}`
      nodes.add(`${tenant}|${evidence}`)
      edges.add(`${tenant}|${contract}->${evidence}`)
    }
  }
  return { nodes, edges }
}

export async function reconcileProductMemory(): Promise<ReconciliationReport> {
  const { revisions, entries } = sourceRecords()
  const configuredTenants = (process.env.OSGARD_PRODUCT_TENANT_ID || "").split(",").map((item) => item.trim()).filter(Boolean)
  const sourceTenants = [...new Set([defaultTenant, ...configuredTenants, ...revisions.map((item) => item.tenantId || defaultTenant), ...entries.map((item) => item.tenantId || defaultTenant)])]
  const client = new Client({
    connectionString: process.env.OSGARD_PRODUCT_POSTGRES_URL,
    application_name: "osgard-product-memory-reconcile",
    connectionTimeoutMillis: 5_000,
  })
  if (!process.env.OSGARD_PRODUCT_POSTGRES_URL) throw new Error("OSGARD_PRODUCT_POSTGRES_URL is required; no database action was taken.")
  const contracts: any[] = [], evidence: any[] = [], nodes: any[] = [], edges: any[] = []
  try {
    await client.connect()
    for (const tenant of sourceTenants) {
      await client.query("BEGIN")
      await client.query("SELECT set_config('osgard.tenant_id', $1, true)", [tenant])
      contracts.push(...(await client.query("SELECT blueprint_id, revision, contract_hash FROM osgard_product.product_contracts")).rows.map((row) => ({ ...row, tenant_id: tenant })))
      evidence.push(...(await client.query("SELECT id, contract_id, revision, kind, status FROM osgard_product.evidence_ledger")).rows.map((row) => ({ ...row, tenant_id: tenant })))
      nodes.push(...(await client.query("SELECT id, blueprint_id, kind, revision FROM osgard_product.product_graph_nodes")).rows.map((row) => ({ ...row, tenant_id: tenant })))
      edges.push(...(await client.query("SELECT id, from_node_id, to_node_id, kind FROM osgard_product.product_graph_edges")).rows.map((row) => ({ ...row, tenant_id: tenant })))
      await client.query("COMMIT")
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally { await client.end().catch(() => undefined) }

  const contractMap = new Map(contracts.map((row) => [`${row.tenant_id}|${row.blueprint_id}|${row.revision}`, row]))
  const sourceContractKeys = new Set<string>()
  const missingContracts: string[] = [], hashMismatches: string[] = []
  for (const item of revisions) {
    const tenant = item.tenantId || defaultTenant
    const key = `${tenant}|${item.id}|${item.revision}`; sourceContractKeys.add(key)
    const row = contractMap.get(key)
    if (!row) missingContracts.push(key)
    else if (item.contractHash && row.contract_hash !== item.contractHash) hashMismatches.push(key)
  }
  const missingEvidence: string[] = []
  const sourceEvidenceIds = new Set(entries.map((item) => `${item.tenantId || defaultTenant}|${item.id}`))
  const postgresEvidenceIds = new Set(evidence.map((row) => `${row.tenant_id}|${row.id}`))
  for (const item of entries) {
    const key = `${item.tenantId || defaultTenant}|${item.id}`
    if (!postgresEvidenceIds.has(key)) missingEvidence.push(key)
  }
  const expected = expectedGraph(revisions, entries)
  const postgresNodeKeys = new Set(nodes.map((row) => `${row.tenant_id}|${row.id}`))
  const postgresEdgeKeys = new Set(edges.map((row) => `${row.tenant_id}|${row.from_node_id}->${row.to_node_id}`))
  const missingNodes = [...expected.nodes].filter((key) => !postgresNodeKeys.has(key))
  const missingEdges = [...expected.edges].filter((key) => !postgresEdgeKeys.has(key))
  const expectedNodeIds = expected.nodes, expectedEdgeIds = expected.edges
  const extras = [
    ...contracts.filter((row) => !sourceContractKeys.has(`${row.tenant_id}|${row.blueprint_id}|${row.revision}`)).map((row) => `contract:${row.tenant_id}|${row.blueprint_id}|${row.revision}`),
    ...evidence.filter((row) => !sourceEvidenceIds.has(`${row.tenant_id}|${row.id}`)).map((row) => `evidence:${row.tenant_id}|${row.id}`),
    ...nodes.filter((row) => !expectedNodeIds.has(`${row.tenant_id}|${row.id}`)).map((row) => `node:${row.tenant_id}|${row.id}`),
    ...edges.filter((row) => !expectedEdgeIds.has(`${row.tenant_id}|${row.from_node_id}->${row.to_node_id}`)).map((row) => `edge:${row.tenant_id}|${row.id}`),
  ]
  const divergence = { missingContracts, hashMismatches, missingEvidence, missingNodes, missingEdges, extras }
  return { checkedAt: new Date().toISOString(), source: { blueprints: new Set(revisions.map((item) => item.id)).size, revisions: revisions.length, evidence: entries.length }, postgres: { contracts: contracts.length, evidence: evidence.length, nodes: nodes.length, edges: edges.length }, divergence, ok: Object.values(divergence).every((items) => items.length === 0) }
}

if (require.main === module) {
  reconcileProductMemory().then((report) => { console.log(JSON.stringify(report, null, 2)); if (!report.ok) process.exitCode = 2 }).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
