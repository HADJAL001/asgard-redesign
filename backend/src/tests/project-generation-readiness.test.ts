import { test } from "node:test"
import assert from "node:assert/strict"
import { firstAcceptedProviderResponse, resolveProjectGenerationReadiness } from "../services/app-generator"

test("project generation requires a coder plus Claude or Kimi reasoning", () => {
  assert.deepEqual(
    resolveProjectGenerationReadiness({ deepSeek: false, claude: true, kimi: false }),
    {
      ready: false,
      roles: { planner: true, coder: false, reviewer: true },
      missing: ["coder"],
    },
  )

  assert.equal(
    resolveProjectGenerationReadiness({ deepSeek: false, claude: false, kimi: true }).ready,
    true,
    "Kimi is a verified fallback for code, planning, and review",
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

test("planner chain falls through when the first provider returns non-JSON", async () => {
  const calls: string[] = []
  const result = await firstAcceptedProviderResponse(
    [
      async () => {
        calls.push("claude")
        return "I can't discuss that."
      },
      async () => {
        calls.push("kimi")
        return '{"files":[]}'
      },
    ],
    "plan",
    100,
    (response) => {
      try {
        JSON.parse(response)
        return true
      } catch {
        return false
      }
    },
  )

  assert.equal(result, '{"files":[]}')
  assert.deepEqual(calls, ["claude", "kimi"])
})

test("coder fallback accepts Kimi output after DeepSeek is unavailable or invalid", async () => {
  const calls: string[] = []
  const result = await firstAcceptedProviderResponse(
    [
      async () => {
        calls.push("deepseek")
        return "not a fenced source file"
      },
      async () => {
        calls.push("kimi")
        return "```tsx\nexport default function App(){return <main /> }\n```"
      },
    ],
    "code",
    100,
    (response) => response.startsWith("```tsx"),
  )
  assert.match(result || "", /export default function App/)
  assert.deepEqual(calls, ["deepseek", "kimi"])
})
