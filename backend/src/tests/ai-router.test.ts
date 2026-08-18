import assert from "node:assert/strict"
import test from "node:test"
import {
  isProviderRefusal,
  providerModelsUrl,
  providerTimeoutMs,
  shouldDisableProviderThinking,
} from "../services/ai-router"

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

test("provider preflight derives a token-free model catalogue endpoint", () => {
  assert.equal(
    providerModelsUrl("https://api.deepseek.com/chat/completions"),
    "https://api.deepseek.com/models",
  )
  assert.equal(
    providerModelsUrl("https://gateway.example/v1/messages?trace=1"),
    "https://gateway.example/v1/models",
  )
})

test("HTTP 200 gateway refusals are not accepted as model output", () => {
  assert.equal(isProviderRefusal("I can't discuss that."), true)
  assert.equal(isProviderRefusal("I’m sorry, but I can’t assist with that request."), true)
  assert.equal(isProviderRefusal('{"summary":"Discuss that risk with the user"}'), false)
})

test("reasoning is disabled for code and structured-output providers", () => {
  assert.equal(shouldDisableProviderThinking("deepseek-raw"), true)
  assert.equal(shouldDisableProviderThinking("kimi-raw"), true)
  assert.equal(shouldDisableProviderThinking("claude"), false)
  assert.equal(shouldDisableProviderThinking("grok-raw"), false)
})
