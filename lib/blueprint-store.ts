import fs from "node:fs"
import path from "node:path"

export type StoredBlueprint = {
  id: string
  revision: number
  app: string
  productType?: string
  preset: string
  brief: string
  components: string[]
  stages: string[]
  generatedAt: string
  arbitraryHtml: false
  quality: { score: number; warnings: string[]; humanReviewRequired: boolean }
  aiPlan?: { summary: string; components: string[]; risks: string[] }
  approval?: { status: "approved"; approvedAt: string }
}

type Store = Record<string, StoredBlueprint[]>

const MAX_REVISIONS_PER_BLUEPRINT = 20
const MAX_BLUEPRINTS = 500
const storePath = process.env.BLUEPRINT_STORE_PATH || path.join(process.cwd(), ".data", "blueprints.json")

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
