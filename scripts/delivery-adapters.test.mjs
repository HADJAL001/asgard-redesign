import assert from "node:assert/strict"
import test from "node:test"
import { validateDeliveryAdapterRecords } from "../lib/delivery-adapters.ts"

const cloudflare = { id: 1, connectorId: "cloudflare", status: "active", lastTestStatus: "passed" }
const supabase = { id: 2, connectorId: "supabase-management", status: "active", lastTestStatus: "passed" }
const stripe = { id: 3, connectorId: "stripe", status: "active", lastTestStatus: "passed" }

test("delivery requires the matching tested infrastructure adapters", () => {
  assert.equal(validateDeliveryAdapterRecords([1, 2], [cloudflare, supabase], ["cloudflare", "supabase-management"]).ready, true)
  assert.equal(validateDeliveryAdapterRecords([1], [cloudflare], ["supabase-management"]).ready, false)
  assert.equal(validateDeliveryAdapterRecords([3], [stripe]).ready, false)
  assert.equal(validateDeliveryAdapterRecords([1, 3], [cloudflare, stripe], ["cloudflare"]).ready, true)
  assert.equal(validateDeliveryAdapterRecords([3], [stripe], ["cloudflare"]).ready, false)
  assert.equal(validateDeliveryAdapterRecords([2], [{ ...supabase, lastTestStatus: "error" }], ["supabase-management"]).ready, false)
  assert.equal(validateDeliveryAdapterRecords([], [], ["cloudflare"]).ready, false)
  assert.equal(validateDeliveryAdapterRecords([], []).ready, true)
})
