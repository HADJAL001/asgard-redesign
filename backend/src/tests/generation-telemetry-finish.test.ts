import assert from "node:assert/strict"
import test from "node:test"
import { recordAiCall, withGenerationTelemetry } from "../lib/generation-telemetry"

test("onFinish receives usage even when the generation throws", async () => {
  let finished: { calls: number; totalTokens: number } | null = null
  await assert.rejects(
    () =>
      withGenerationTelemetry(
        async () => {
          recordAiCall({
            provider: "deepseek",
            model: "test",
            inputTokens: 700,
            outputTokens: 300,
            ms: 10,
            estimated: false,
            ok: true,
          })
          throw new Error("durable worker retry")
        },
        undefined,
        (snapshot) => {
          finished = { calls: snapshot.calls, totalTokens: snapshot.totalTokens }
        },
      ),
    /durable worker retry/,
  )
  assert.deepEqual(finished, { calls: 1, totalTokens: 1000 })
})

test("onFinish failure never replaces a successful generation result", async () => {
  const { result } = await withGenerationTelemetry(
    async () => "ready",
    undefined,
    () => {
      throw new Error("usage storage unavailable")
    },
  )
  assert.equal(result, "ready")
})

