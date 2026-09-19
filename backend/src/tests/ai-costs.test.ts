import assert from "node:assert/strict"
import test from "node:test"
import { parseAiModelPricing, summarizeAiCost } from "../lib/ai-costs"

test("AI cost uses independent input and output token rates", () => {
  const cost = summarizeAiCost([
    { provider: "vendor", model: "model", inputTokens: 2_000_000, outputTokens: 500_000, estimated: false },
  ], {
    "vendor:model": { inputPerMillionUsd: 0.25, outputPerMillionUsd: 2 },
  })
  assert.deepEqual(cost, { pricedUsd: 1.5, pricedCalls: 1, unpricedCalls: 0, estimatedCalls: 0 })
})

test("AI cost never represents an unpriced model as free", () => {
  const cost = summarizeAiCost([
    { provider: "vendor", model: "unknown", inputTokens: 100, outputTokens: 100, estimated: false },
  ], {})
  assert.deepEqual(cost, { pricedUsd: 0, pricedCalls: 0, unpricedCalls: 1, estimatedCalls: 0 })
})

test("AI cost retains coverage when priced and unpriced calls are mixed", () => {
  const cost = summarizeAiCost([
    { provider: "vendor", model: "known", inputTokens: 1_000_000, outputTokens: 0, estimated: true },
    { provider: "vendor", model: "unknown", inputTokens: 1_000_000, outputTokens: 0, estimated: false },
  ], { "vendor:known": { inputPerMillionUsd: 1, outputPerMillionUsd: 1 } })
  assert.deepEqual(cost, { pricedUsd: 1, pricedCalls: 1, unpricedCalls: 1, estimatedCalls: 1 })
})

test("malformed AI pricing configuration is ignored", () => {
  assert.deepEqual(parseAiModelPricing("not-json"), {})
  assert.deepEqual(parseAiModelPricing('{"vendor:model":{"inputPerMillionUsd":-1,"outputPerMillionUsd":1}}'), {})
})
