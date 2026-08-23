import test from "node:test"
import assert from "node:assert/strict"
import {
  PROJECT_CREATION_COST_TC,
  TIMECOIN_USD_CENTS,
  parseTimecoinQuantity,
  timecoinPurchaseCents,
  TIMECOIN_PRICES,
  ORCHESTRATOR_NODE_COST_TC,
} from "../lib/timecoin-economy"

test("TimeCoin has one canonical fiat and project price", () => {
  assert.equal(TIMECOIN_USD_CENTS, 1_000)
  assert.equal(PROJECT_CREATION_COST_TC, 1)
  assert.equal(timecoinPurchaseCents(1), 1_000)
  assert.equal(timecoinPurchaseCents(100), 100_000)
})

test("paid operations stay proportional to one-project pricing", () => {
  assert.equal(TIMECOIN_PRICES.artifactForge, 2)
  assert.ok(TIMECOIN_PRICES.artifactEvolve < PROJECT_CREATION_COST_TC)
  assert.ok(TIMECOIN_PRICES.feedbackReward < TIMECOIN_PRICES.artifactEvolve)
  assert.ok(Math.max(...Object.values(ORCHESTRATOR_NODE_COST_TC)) < PROJECT_CREATION_COST_TC)
  assert.equal(TIMECOIN_PRICES.walliExclusive, 5)
  assert.equal(TIMECOIN_PRICES.twinRentalBase, 0.1)
  assert.equal(TIMECOIN_PRICES.twinRentalPerLevel, 0.05)
})

test("checkout accepts only bounded integer quantities", () => {
  assert.equal(parseTimecoinQuantity("10"), 10)
  for (const value of [0, -1, 1.5, "1.5", 1_001, NaN, Infinity, null]) {
    assert.equal(parseTimecoinQuantity(value), null)
  }
})
