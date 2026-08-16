import assert from "node:assert/strict"
import test from "node:test"
import { providerTimeoutMs } from "../services/ai-router"

test("provider timeout has a safe default and hard bounds", () => {
  const previous = process.env.AI_PROVIDER_TIMEOUT_MS
  delete process.env.AI_PROVIDER_TIMEOUT_MS
  assert.equal(providerTimeoutMs(), 90_000)

  process.env.AI_PROVIDER_TIMEOUT_MS = "1"
  assert.equal(providerTimeoutMs(), 10_000)
  process.env.AI_PROVIDER_TIMEOUT_MS = "999999"
  assert.equal(providerTimeoutMs(), 300_000)
  process.env.AI_PROVIDER_TIMEOUT_MS = "invalid"
  assert.equal(providerTimeoutMs(), 90_000)

  if (previous === undefined) delete process.env.AI_PROVIDER_TIMEOUT_MS
  else process.env.AI_PROVIDER_TIMEOUT_MS = previous
})
