import assert from "node:assert/strict"
import test from "node:test"
import {
  GenerationTokenBudgetExceededError,
  currentTelemetry,
  recordAiCall,
  reserveAiCallTokens,
  withGenerationTelemetry,
} from "../lib/generation-telemetry"

test("token budget atomically accounts for parallel in-flight reservations", async () => {
  await withGenerationTelemetry(async () => {
    const releaseFirst = reserveAiCallTokens(200, 300)
    assert.equal(currentTelemetry()?.tokensRemaining, 500)

    assert.throws(
      () => reserveAiCallTokens(250, 300),
      (error) => error instanceof GenerationTokenBudgetExceededError
        && error.limit === 1_000
        && error.spent === 500
        && error.requested === 550,
    )

    releaseFirst()
    assert.equal(currentTelemetry()?.tokensRemaining, 1_000)
  }, undefined, undefined, { tokenLimit: 1_000 })
})

test("completed usage replaces a conservative reservation with actual tokens", async () => {
  const { telemetry } = await withGenerationTelemetry(async () => {
    const release = reserveAiCallTokens(300, 500)
    recordAiCall({
      provider: "deepseek",
      model: "test",
      inputTokens: 240,
      outputTokens: 160,
      ms: 10,
      estimated: false,
      ok: true,
    })
    release()
    assert.equal(currentTelemetry()?.tokensRemaining, 600)
  }, undefined, undefined, { tokenLimit: 1_000 })

  assert.equal(telemetry.totalTokens, 400)
  assert.equal(telemetry.tokenLimit, 1_000)
  assert.equal(telemetry.tokensRemaining, 600)
})

test("disabled budget preserves existing unlimited telemetry behavior", async () => {
  const { telemetry } = await withGenerationTelemetry(async () => {
    const release = reserveAiCallTokens(10_000_000, 10_000_000)
    release()
  })
  assert.equal(telemetry.tokenLimit, null)
  assert.equal(telemetry.tokensRemaining, null)
})
