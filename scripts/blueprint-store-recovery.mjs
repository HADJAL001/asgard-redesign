import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "osgard-store-recovery-"))
const paths = {
  store: path.join(tempRoot, "blueprints.json"),
  evidence: path.join(tempRoot, "evidence.json"),
  tokens: path.join(tempRoot, "tokens.json"),
}
process.env.BLUEPRINT_STORE_PATH = paths.store
process.env.BLUEPRINT_EVIDENCE_PATH = paths.evidence
process.env.BLUEPRINT_EVIDENCE_TOKENS_PATH = paths.tokens

try {
  const store = await import(pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/blueprint-store.ts")).href)
  const blueprint = {
    id: "11111111-1111-4111-8111-111111111111",
    tenantId: "osgardnewworld",
    revision: 1,
    app: "recovery-check",
    preset: "futuristic",
    brief: "A durable recovery verification brief",
    components: ["app-shell"],
    stages: ["intent"],
    generatedAt: new Date().toISOString(),
    arbitraryHtml: false,
    quality: { score: 90, warnings: [], humanReviewRequired: false },
  }
  store.saveBlueprint(blueprint)
  store.saveBlueprint({ ...blueprint, revision: 2, brief: "A second durable recovery verification brief" })
  fs.writeFileSync(paths.store, "{\"not-a-revision-list\":true}")
  const recovered = store.getBlueprint(blueprint.id)
  if (!recovered || recovered.revision !== 1) throw new Error("durable blueprint recovery failed")
  if (!fs.existsSync(`${paths.store}.bak`)) throw new Error("blueprint backup snapshot missing")
  console.log("blueprint-store-recovery:ok")
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true })
}
