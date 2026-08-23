import test from "node:test"
import assert from "node:assert/strict"
import { compareTimecoinPurchases } from "../lib/billing-reconciliation"

const local = [{ userId: 7, quantity: 2, amountCents: 2_000, sessionId: "cs_paid" }]
const remote = [{ id: "cs_paid", paid: true, amountCents: 2_000, userId: 7, quantity: 2 }]

test("billing reconciliation accepts an exact paid TimeCoin checkout", () => {
  assert.deepEqual(compareTimecoinPurchases(local, remote), [])
})

test("billing reconciliation detects paid but uncredited sessions", () => {
  const issues = compareTimecoinPurchases([], remote)
  assert.equal(issues[0]?.code, "PAID_SESSION_NOT_CREDITED")
})

test("billing reconciliation detects local credits without valid Stripe payment", () => {
  const issues = compareTimecoinPurchases(local, [{ ...remote[0], paid: false }])
  assert.ok(issues.some((issue) => issue.code === "STRIPE_NOT_PAID"))
})

test("billing reconciliation detects amount and metadata tampering", () => {
  const issues = compareTimecoinPurchases(
    [{ ...local[0], amountCents: 1_500 }],
    [{ ...remote[0], amountCents: 1_500, userId: 8 }],
  )
  assert.ok(issues.some((issue) => issue.code === "LOCAL_AMOUNT_MISMATCH"))
  assert.ok(issues.some((issue) => issue.code === "STRIPE_AMOUNT_MISMATCH"))
  assert.ok(issues.some((issue) => issue.code === "STRIPE_METADATA_MISMATCH"))
})
