import test from "node:test"
import assert from "node:assert/strict"
import {
  PROJECT_CREATION_COST_TC,
  projectAdmissionCostTimecoin,
  TIMECOIN_USD_CENTS,
  parseTimecoinQuantity,
  timecoinPurchaseCents,
  TIMECOIN_PRICES,
  ORCHESTRATOR_NODE_COST_TC,
} from "../lib/timecoin-economy"
import { MARKET_CURRENCIES } from "../lib/market-fees"

test("TimeCoin has one canonical fiat price and is not charged for project generation", () => {
  assert.equal(TIMECOIN_USD_CENTS, 1_000)
  assert.equal(PROJECT_CREATION_COST_TC, 0)
  assert.equal(timecoinPurchaseCents(1), 1_000)
  assert.equal(timecoinPurchaseCents(100), 100_000)
})

test("project admission never charges TimeCoin", () => {
  assert.equal(projectAdmissionCostTimecoin(true), 0)
  assert.equal(projectAdmissionCostTimecoin(false), 0)
})

test("TimeCoin-priced premium operations keep their explicit prices", () => {
  assert.equal(TIMECOIN_PRICES.artifactForge, 2)
  assert.ok(TIMECOIN_PRICES.artifactEvolve > 0)
  assert.ok(TIMECOIN_PRICES.feedbackReward < TIMECOIN_PRICES.artifactEvolve)
  assert.ok(Math.max(...Object.values(ORCHESTRATOR_NODE_COST_TC)) > 0)
  assert.equal(TIMECOIN_PRICES.walliExclusive, 5)
  assert.equal(TIMECOIN_PRICES.twinRentalBase, 0.1)
  assert.equal(TIMECOIN_PRICES.twinRentalPerLevel, 0.05)
})

test("market settlement excludes soft currency and forge materials", () => {
  assert.deepEqual(MARKET_CURRENCIES, ["timecoin"])
})

test("checkout accepts only bounded integer quantities", () => {
  assert.equal(parseTimecoinQuantity("10"), 10)
  for (const value of [0, -1, 1.5, "1.5", 1_001, NaN, Infinity, null]) {
    assert.equal(parseTimecoinQuantity(value), null)
  }
})
