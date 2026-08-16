import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import test from "node:test"
import db from "../lib/db"
import { deriveDesignBrief } from "../lib/design-system"
import { durableCache } from "../services/agents/durable-cache"
import { cacheVerifiedAppGeneration } from "../services/app-generator"

test("only a released AI result enters the durable generation cache", () => {
  const name = `cache-test-${Date.now()}`
  const hint = "verified cache regression"
  const brief = deriveDesignBrief({ name, hint })
  const fallback = {
    files: [{ path: "app/page.tsx", content: "export default function Page() { return null }" }],
    source: "fallback" as const,
    brief,
  }
  const verified = { ...fallback, source: "ai" as const }

  cacheVerifiedAppGeneration(name, hint, fallback, "ready")
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM agent_cache WHERE cache_key LIKE 'app-generator:%'`).get() as { count: number }).count, 0)

  cacheVerifiedAppGeneration(name, hint, verified, "failed")
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM agent_cache WHERE cache_key LIKE 'app-generator:%'`).get() as { count: number }).count, 0)

  cacheVerifiedAppGeneration(name, hint, verified, "ready")
  const row = db.prepare(`SELECT cache_key FROM agent_cache WHERE cache_key LIKE 'app-generator:%'`).get() as { cache_key: string }
  const cached = durableCache.get<any>(row.cache_key)
  assert.equal(cached?.source, "ai")
})
