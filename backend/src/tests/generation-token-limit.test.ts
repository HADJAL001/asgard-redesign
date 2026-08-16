import assert from "node:assert/strict"
import test from "node:test"
import {
  MIN_TOKEN_LIMIT_SAMPLES,
  recommendTokenLimit,
  type GenerationSample,
} from "../lib/generation-estimate"

function sample(tokens: number): GenerationSample {
  return {
    depth: "deep",
    path: "ai",
    calls: 1,
    tokens,
    durationMs: 100,
    firstTry: true,
    unmeasured: 0,
  }
}

test("token limit uses p95 plus 20 percent and rounds up to 10k", () => {
  const rows = Array.from({ length: MIN_TOKEN_LIMIT_SAMPLES }, (_, index) => sample((index + 1) * 10_000))
  assert.deepEqual(recommendTokenLimit(rows), {
    samples: 20,
    p95: 190_000,
    headroom: 0.2,
    recommended: 230_000,
  })
})

test("token limit stays unknown until the sample is operationally meaningful", () => {
  const rows = Array.from({ length: MIN_TOKEN_LIMIT_SAMPLES - 1 }, () => sample(100_000))
  assert.equal(recommendTokenLimit(rows), null)
})

