import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveProjectGenerationReadiness } from "../services/app-generator"

test("project generation requires DeepSeek plus Claude or Kimi", () => {
  assert.deepEqual(
    resolveProjectGenerationReadiness({ deepSeek: false, claude: true, kimi: false }),
    {
      ready: false,
      roles: { planner: true, coder: false, reviewer: true },
      missing: ["coder"],
    },
  )

  assert.equal(
    resolveProjectGenerationReadiness({ deepSeek: true, claude: false, kimi: true }).ready,
    true,
  )
  assert.equal(
    resolveProjectGenerationReadiness({ deepSeek: true, claude: false, kimi: false }).ready,
    false,
  )
})
