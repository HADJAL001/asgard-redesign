import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"

export type StoredBlueprint = {
  id: string
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
  approval?: { status: "approved"; approvedAt: string }
}

export type BlueprintEvidenceKind = "typecheck" | "unit" | "a11y" | "security" | "performance" | "visual-diff" | "deploy" | "social-preview" | "rollback"
export type BlueprintEvidence = {
  id: string
  blueprintId: string
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

export function issueBlueprintEvidenceToken(blueprintId: string) {
  const token = crypto.randomBytes(32).toString("hex")
  const tokens = readEvidenceTokens()
  tokens[blueprintId] = token
  writeEvidenceTokens(tokens)
  return token
}

export function verifyBlueprintEvidenceToken(blueprintId: string, candidate: unknown) {
  if (typeof candidate !== "string" || !/^[a-f0-9]{64}$/.test(candidate)) return false
  const expected = readEvidenceTokens()[blueprintId]
  if (!expected) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))
}

export function saveBlueprint(blueprint: StoredBlueprint) {
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

export function getBlueprint(id: string, revision?: number) {
  const revisions = readStore()[id]
  if (!revisions?.length) return null
  if (revision === undefined) return revisions[revisions.length - 1]
  return revisions.find((item) => item.revision === revision) || null
}

export function listBlueprintRevisions(id: string) {
  return readStore()[id] || []
}

export function listBlueprintEvidence(id: string) {
  return readEvidence()[id] || []
}

export function latestBlueprintEvidence(id: string, kind: BlueprintEvidenceKind) {
  return listBlueprintEvidence(id).toReversed().find((entry) => entry.kind === kind) || null
}

export function appendBlueprintEvidence(evidence: BlueprintEvidence) {
  const store = readEvidence()
  const previous = store[evidence.blueprintId] || []
  store[evidence.blueprintId] = [...previous, evidence].slice(-100)
  writeEvidence(store)
  return evidence
}
