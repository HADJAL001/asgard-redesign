import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

export type StoredBlueprint = {
  id: string
  tenantId?: string
  revision: number
  app: string
  productType?: string
  preset: string
  contractVersion?: string
  contractHash?: string
  brief: string
  components: string[]
  stages: string[]
  generatedAt: string
  arbitraryHtml: false
  quality: { score: number; warnings: string[]; humanReviewRequired: boolean }
  aiPlan?: { summary: string; components: string[]; risks: string[] }
  canvasSlots?: { id: string; component: string; role: string; states: string[] }[]
  approval?: { status: "approved"; approvedAt: string }
  generation?: { taskId: string; status: "queued" | "processing" | "completed" | "failed" | "cancelled"; progress: number; currentStep?: string; error?: string; result?: { appUrl?: string; previewUrl?: string; repoUrl?: string }; updatedAt: string }
  generationHistory?: NonNullable<StoredBlueprint["generation"]>[]
  delivery?: { provider: "osgard-cluster" | "vercel" | "netlify" | "custom"; domain?: string; supabaseProjectRef?: string; integrationIds?: number[]; updatedAt: string }
}

export type BlueprintEvidenceKind = "typecheck" | "unit" | "a11y" | "security" | "performance" | "visual-diff" | "deploy" | "social-preview" | "rollback"
export type BlueprintEvidence = {
  id: string
  blueprintId: string
  tenantId?: string
  revision: number
  contractHash: string
  kind: BlueprintEvidenceKind
  status: "passed" | "failed" | "skipped"
  summary: string
  capturedAt: string
  source: string
}

export type BlueprintGraphNodeKind = "idea" | "contract" | "evidence" | "delivery" | "generation"
export type BlueprintGraphNode = {
  id: string
  kind: BlueprintGraphNodeKind
  label: string
  revision?: number
  status?: string
  timestamp: string
  contractHash?: string
}
export type BlueprintGraphEdge = {
  id: string
  from: string
  to: string
  kind: "created" | "supersedes" | "verified_by" | "delivered_to" | "generated_as" | "transitioned_to"
}
export type BlueprintGraph = {
  blueprintId: string
  tenantId: string
  nodes: BlueprintGraphNode[]
  edges: BlueprintGraphEdge[]
}

type Store = Record<string, StoredBlueprint[]>

const MAX_REVISIONS_PER_BLUEPRINT = 20
const MAX_BLUEPRINTS = 500
const storePath = process.env.BLUEPRINT_STORE_PATH || path.join(process.cwd(), ".data", "blueprints.json")
const evidencePath = process.env.BLUEPRINT_EVIDENCE_PATH || path.join(process.cwd(), ".data", "blueprint-evidence.json")
const evidenceTokensPath = process.env.BLUEPRINT_EVIDENCE_TOKENS_PATH || path.join(process.cwd(), ".data", "blueprint-evidence-tokens.json")

function readJsonObject(filePath: string, isValid: (value: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  for (const candidate of [filePath, `${filePath}.bak`]) {
    try {
      const value = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ candidate, "utf8"))
      if (value && typeof value === "object" && !Array.isArray(value) && isValid(value as Record<string, unknown>)) return value as Record<string, unknown>
    } catch {
      // Try the previous durable snapshot before treating an artifact as empty.
    }
  }
  return null
}

function flushDescriptor(descriptor: number) {
  try {
    fs.fsyncSync(descriptor)
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : undefined
    if (code !== "EPERM" && code !== "ENOSYS") throw error
  }
}

function readStore(): Store {
  return readJsonObject(storePath, (value) => Object.values(value).every((revisions) => Array.isArray(revisions) && revisions.every((revision) => revision && typeof revision === "object" && typeof revision.id === "string" && Number.isInteger(revision.revision)))) as Store || {}
}

function writeJsonDurably(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  if (fs.existsSync(filePath)) {
    const backupTempPath = `${filePath}.${process.pid}.bak.tmp`
    fs.copyFileSync(filePath, backupTempPath)
    const backupDescriptor = fs.openSync(backupTempPath, "r")
    try {
      flushDescriptor(backupDescriptor)
    } finally {
      fs.closeSync(backupDescriptor)
    }
    fs.renameSync(backupTempPath, `${filePath}.bak`)
  }
  const tempPath = `${filePath}.${process.pid}.tmp`
  const descriptor = fs.openSync(tempPath, "w", 0o600)
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value), { encoding: "utf8" })
    flushDescriptor(descriptor)
  } finally {
    fs.closeSync(descriptor)
  }
  fs.renameSync(tempPath, filePath)
}

function writeStore(store: Store) {
  writeJsonDurably(storePath, store)
}

function readEvidence(): Record<string, BlueprintEvidence[]> {
  return readJsonObject(evidencePath, (value) => Object.values(value).every((entries) => Array.isArray(entries) && entries.every((entry) => entry && typeof entry === "object" && typeof entry.id === "string" && typeof entry.blueprintId === "string" && typeof entry.kind === "string" && typeof entry.contractHash === "string"))) as Record<string, BlueprintEvidence[]> || {}
}

function writeEvidence(store: Record<string, BlueprintEvidence[]>) {
  writeJsonDurably(evidencePath, store)
}

function readEvidenceTokens(): Record<string, string> {
  return readJsonObject(evidenceTokensPath, (value) => Object.values(value).every((token) => typeof token === "string" && /^[a-f0-9]{64}$/.test(token))) as Record<string, string> || {}
}

function writeEvidenceTokens(store: Record<string, string>) {
  writeJsonDurably(evidenceTokensPath, store)
}

function pruneBlueprintArtifacts(removedIds: string[]) {
  if (!removedIds.length) return
  const removed = new Set(removedIds)
  const evidence = readEvidence()
  let evidenceChanged = false
  for (const id of removed) {
    if (id in evidence) {
      delete evidence[id]
      evidenceChanged = true
    }
  }
  if (evidenceChanged) writeEvidence(evidence)

  const tokens = readEvidenceTokens()
  let tokensChanged = false
  for (const key of Object.keys(tokens)) {
    const blueprintId = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key
    if (removed.has(blueprintId)) {
      delete tokens[key]
      tokensChanged = true
    }
  }
  if (tokensChanged) writeEvidenceTokens(tokens)
}

export function issueBlueprintEvidenceToken(blueprintId: string, tenantId = DEFAULT_TENANT_ID) {
  const token = crypto.randomBytes(32).toString("hex")
  const tokens = readEvidenceTokens()
  tokens[`${tenantId}:${blueprintId}`] = token
  writeEvidenceTokens(tokens)
  return token
}

export function verifyBlueprintEvidenceToken(blueprintId: string, candidate: unknown, tenantId = DEFAULT_TENANT_ID) {
  if (typeof candidate !== "string" || !/^[a-f0-9]{64}$/.test(candidate)) return false
  const expected = readEvidenceTokens()[`${tenantId}:${blueprintId}`] || (tenantId === DEFAULT_TENANT_ID ? readEvidenceTokens()[blueprintId] : undefined)
  if (!expected) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))
}

export function saveBlueprint(blueprint: StoredBlueprint) {
  blueprint = { ...blueprint, tenantId: blueprint.tenantId || DEFAULT_TENANT_ID }
  const store = readStore()
  const revisions = store[blueprint.id] || []
  store[blueprint.id] = [...revisions, blueprint].slice(-MAX_REVISIONS_PER_BLUEPRINT)
  const ids = Object.keys(store)
  const removedIds: string[] = []
  if (ids.length > MAX_BLUEPRINTS) {
    for (const id of ids.slice(0, ids.length - MAX_BLUEPRINTS)) {
      delete store[id]
      removedIds.push(id)
    }
  }
  writeStore(store)
  pruneBlueprintArtifacts(removedIds)
  return blueprint
}

const DEFAULT_TENANT_ID = "osgardnewworld"
const tenantMatches = (blueprint: StoredBlueprint, tenantId: string) => (blueprint.tenantId || DEFAULT_TENANT_ID) === tenantId

export function getBlueprint(id: string, revision?: number, tenantId = DEFAULT_TENANT_ID) {
  const revisions = readStore()[id]
  if (!revisions?.length) return null
  const tenantRevisions = revisions.filter((item) => tenantMatches(item, tenantId))
  if (revision === undefined) return tenantRevisions[tenantRevisions.length - 1] || null
  return tenantRevisions.find((item) => item.revision === revision) || null
}

export function listBlueprintRevisions(id: string, tenantId = DEFAULT_TENANT_ID) {
  return (readStore()[id] || []).filter((item) => tenantMatches(item, tenantId))
}

export function updateBlueprintGeneration(id: string, revision: number, generation: StoredBlueprint["generation"], tenantId = DEFAULT_TENANT_ID) {
  const store = readStore()
  const revisions = store[id]
  if (!revisions?.length) return null
  const index = revisions.findIndex((item) => item.revision === revision && tenantMatches(item, tenantId))
  if (index < 0) return null
  const previousHistory = revisions[index].generationHistory || (revisions[index].generation ? [revisions[index].generation] : [])
  revisions[index] = { ...revisions[index], ...(generation ? { generation, generationHistory: [...previousHistory, generation].slice(-100) } : { generation: undefined }) }
  writeStore(store)
  return revisions[index]
}

export function updateBlueprintDelivery(id: string, revision: number, delivery: StoredBlueprint["delivery"], tenantId = DEFAULT_TENANT_ID) {
  const store = readStore()
  const revisions = store[id]
  if (!revisions?.length) return null
  const index = revisions.findIndex((item) => item.revision === revision && tenantMatches(item, tenantId))
  if (index < 0) return null
  revisions[index] = { ...revisions[index], ...(delivery ? { delivery } : { delivery: undefined }) }
  writeStore(store)
  return revisions[index]
}

export function listBlueprintEvidence(id: string, tenantId = DEFAULT_TENANT_ID) {
  return (readEvidence()[id] || []).filter((entry) => entry.tenantId === tenantId || (!entry.tenantId && tenantId === DEFAULT_TENANT_ID))
}

export function latestBlueprintEvidence(id: string, kind: BlueprintEvidenceKind, tenantId = DEFAULT_TENANT_ID) {
  return listBlueprintEvidence(id, tenantId).toReversed().find((entry) => entry.kind === kind) || null
}

export function appendBlueprintEvidence(evidence: BlueprintEvidence) {
  evidence = { ...evidence, tenantId: evidence.tenantId || DEFAULT_TENANT_ID }
  const store = readEvidence()
  const previous = store[evidence.blueprintId] || []
  store[evidence.blueprintId] = [...previous, evidence].slice(-100)
  writeEvidence(store)
  return evidence
}

/**
 * Build a safe, deterministic Product Graph projection from the durable
 * blueprint/evidence records. Tokens and delivery credentials never enter the
 * graph; every node remains scoped to the requesting tenant.
 */
export function getBlueprintGraph(id: string, tenantId = DEFAULT_TENANT_ID): BlueprintGraph | null {
  const revisions = listBlueprintRevisions(id, tenantId)
  if (!revisions.length) return null
  const evidence = listBlueprintEvidence(id, tenantId)
  const nodes: BlueprintGraphNode[] = []
  const edges: BlueprintGraphEdge[] = []
  const ideaId = `idea:${id}`
  const first = revisions[0]
  nodes.push({ id: ideaId, kind: "idea", label: first.app, timestamp: first.generatedAt })

  revisions.forEach((revision, revisionIndex) => {
    const contractId = `contract:${id}:${revision.revision}`
    nodes.push({ id: contractId, kind: "contract", label: `ProductContract v${revision.revision}`, revision: revision.revision, timestamp: revision.generatedAt, contractHash: revision.contractHash })
    edges.push({ id: `${ideaId}->${contractId}`, from: ideaId, to: contractId, kind: "created" })
    if (revisionIndex > 0) {
      const previousId = `contract:${id}:${revisions[revisionIndex - 1].revision}`
      edges.push({ id: `${previousId}->${contractId}`, from: previousId, to: contractId, kind: "supersedes" })
    }

    for (const entry of evidence.filter((item) => item.revision === revision.revision)) {
      const evidenceId = `evidence:${entry.id}`
      nodes.push({ id: evidenceId, kind: "evidence", label: entry.kind, revision: entry.revision, status: entry.status, timestamp: entry.capturedAt, contractHash: entry.contractHash })
      edges.push({ id: `${contractId}->${evidenceId}`, from: contractId, to: evidenceId, kind: "verified_by" })
    }

    if (revision.delivery) {
      const deliveryId = `delivery:${id}:${revision.revision}`
      nodes.push({ id: deliveryId, kind: "delivery", label: revision.delivery.provider, revision: revision.revision, timestamp: revision.delivery.updatedAt })
      edges.push({ id: `${contractId}->${deliveryId}`, from: contractId, to: deliveryId, kind: "delivered_to" })
    }

    const generationStates = revision.generationHistory || (revision.generation ? [revision.generation] : [])
    let previousGenerationId: string | null = null
    generationStates.forEach((state, stateIndex) => {
      const generationId = `generation:${id}:${revision.revision}:${state.updatedAt}:${stateIndex}`
      nodes.push({ id: generationId, kind: "generation", label: state.taskId, revision: revision.revision, status: state.status, timestamp: state.updatedAt })
      edges.push({ id: `${contractId}->${generationId}`, from: contractId, to: generationId, kind: "generated_as" })
      if (previousGenerationId) edges.push({ id: `${previousGenerationId}->${generationId}`, from: previousGenerationId, to: generationId, kind: "transitioned_to" })
      previousGenerationId = generationId
    })
  })

  return { blueprintId: id, tenantId, nodes, edges }
}
