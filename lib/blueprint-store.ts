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

type Store = Record<string, StoredBlueprint[]>

const MAX_REVISIONS_PER_BLUEPRINT = 20
const MAX_BLUEPRINTS = 500
const storePath = process.env.BLUEPRINT_STORE_PATH || path.join(process.cwd(), ".data", "blueprints.json")
const evidencePath = process.env.BLUEPRINT_EVIDENCE_PATH || path.join(process.cwd(), ".data", "blueprint-evidence.json")
const evidenceTokensPath = process.env.BLUEPRINT_EVIDENCE_TOKENS_PATH || path.join(process.cwd(), ".data", "blueprint-evidence-tokens.json")

function readStore(): Store {
  try {
    const value = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ storePath, "utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value as Store : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  const tempPath = `${storePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 })
  fs.renameSync(tempPath, storePath)
}

function readEvidence(): Record<string, BlueprintEvidence[]> {
  try {
    const value = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ evidencePath, "utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, BlueprintEvidence[]> : {}
  } catch {
    return {}
  }
}

function writeEvidence(store: Record<string, BlueprintEvidence[]>) {
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true })
  const tempPath = `${evidencePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 })
  fs.renameSync(tempPath, evidencePath)
}

function readEvidenceTokens(): Record<string, string> {
  try {
    const value = JSON.parse(fs.readFileSync(/* turbopackIgnore: true */ evidenceTokensPath, "utf8"))
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {}
  } catch {
    return {}
  }
}

function writeEvidenceTokens(store: Record<string, string>) {
  fs.mkdirSync(path.dirname(evidenceTokensPath), { recursive: true })
  const tempPath = `${evidenceTokensPath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(store), { encoding: "utf8", mode: 0o600 })
  fs.renameSync(tempPath, evidenceTokensPath)
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
  if (ids.length > MAX_BLUEPRINTS) {
    for (const id of ids.slice(0, ids.length - MAX_BLUEPRINTS)) delete store[id]
  }
  writeStore(store)
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
