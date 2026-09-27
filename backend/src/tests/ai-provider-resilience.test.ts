import assert from "node:assert/strict"
import test from "node:test"
import { firstAcceptedProviderResponse } from "../lib/ai-failover"
import { openAiCompatibleChatCompletionsUrl, ProviderCircuit, withTransientProviderRetry } from "../lib/ai-provider-resilience"

test("compatible gateway URLs resolve once to the chat completion endpoint", () => {
  assert.equal(openAiCompatibleChatCompletionsUrl("https://gateway.example/v1"), "https://gateway.example/v1/chat/completions")
  assert.equal(openAiCompatibleChatCompletionsUrl("https://gateway.example/v1/chat/completions"), "https://gateway.example/v1/chat/completions")
  assert.throws(() => openAiCompatibleChatCompletionsUrl("not a URL"))
})

test("transient HTTP failures retry with bounded exponential backoff", async () => {
  const statuses = [503, 429, 200]
  const delays: number[] = []
  let calls = 0
  const response = await withTransientProviderRetry(async () => ({ status: statuses[calls++] }), {
    baseDelayMs: 10,
    maxDelayMs: 100,
    sleep: async (delay) => { delays.push(delay) },
  })

  assert.equal(response.status, 200)
  assert.equal(calls, 3)
  assert.deepEqual(delays, [10, 20])
})

test("permanent HTTP errors are not retried", async () => {
  let calls = 0
  const response = await withTransientProviderRetry(async () => ({ status: calls++ === 0 ? 401 : 200 }), {
    sleep: async () => assert.fail("must not retry an authorization error"),
  })
  assert.equal(response.status, 401)
  assert.equal(calls, 1)
})

test("Retry-After is honored but bounded by the configured maximum", async () => {
  const delays: number[] = []
  let calls = 0
  await withTransientProviderRetry(async () => ({
    status: calls++ === 0 ? 429 : 200,
    headers: { get: (name: string) => name === "retry-after" ? "30" : null },
  }), { maxDelayMs: 250, sleep: async (delay) => { delays.push(delay) } })
  assert.deepEqual(delays, [250])
})

test("network errors retry and then return the successful response", async () => {
  let calls = 0
  const response = await withTransientProviderRetry(async () => {
    calls += 1
    if (calls < 3) throw new TypeError("fetch failed")
    return { status: 200 }
  }, { sleep: async () => undefined })
  assert.equal(response.status, 200)
  assert.equal(calls, 3)
})

test("provider circuit opens after repeated failures and admits one half-open probe", () => {
  const circuit = new ProviderCircuit(5, 60_000)
  for (let failure = 0; failure < 5; failure += 1) circuit.recordFailure("http_503", failure * 1000)
  assert.equal(circuit.snapshot(4999).state, "open")
  assert.equal(circuit.tryAcquire(63_999), false)
  assert.equal(circuit.tryAcquire(64_000), true)
  assert.equal(circuit.snapshot(64_000).state, "half-open")
  assert.equal(circuit.tryAcquire(64_000), false)

  circuit.recordFailure("timeout", 64_000)
  assert.equal(circuit.snapshot(64_001).state, "open")
  assert.equal(circuit.tryAcquire(124_000), true)
  circuit.recordSuccess()
  assert.deepEqual(circuit.snapshot(124_001), { state: "closed", failures: 0 })
})

test("provider chains continue after adapter exceptions and pass actual provider identity", async () => {
  const failures: string[] = []
  const first = async function callClaudeRaw(): Promise<string | null> { throw new Error("upstream timeout") }
  const second = async function callKimiRaw(): Promise<string | null> { return "invalid" }
  const third = async function callGeminiRaw(): Promise<string | null> { return "accepted" }
  const result = await firstAcceptedProviderResponse(
    [first, second, third],
    "test prompt",
    100,
    (response) => response === "accepted",
    (_index, _response, provider) => failures.push(provider),
  )
  assert.equal(result, "accepted")
  assert.deepEqual(failures, ["callKimiRaw"])
})
