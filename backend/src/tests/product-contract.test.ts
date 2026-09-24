import assert from "node:assert/strict"
import test from "node:test"
import { ProductContractSchema, contractEvidenceIds, productContractHash } from "../services/product-contract"

const contract = {
  version: "1.0.0",
  productType: "marketplace",
  designDNA: { preset: "futuristic", tokens: { radius: 8, accent: "#64d9e8" } },
  workflows: [{ id: "publish-listing", actor: "seller", success: "Listing is visible and purchasable", risk: "medium" }],
  requirements: [{ id: "listing-proof", text: "Seller can publish a listing", evidence: [{ id: "req-1", kind: "requirement", hash: "a".repeat(64) }] }],
  gates: ["typecheck", "unit", "a11y", "security", "performance", "visual-diff"],
  provenance: { sourceMemoryIds: ["memory-1"], playbookVersion: "marketplace.v2", createdBy: "cofounder" },
}

test("ProductContract validates and produces a stable content hash", () => {
  const parsed = ProductContractSchema.parse(contract)
  assert.equal(productContractHash(parsed), productContractHash(parsed))
  assert.deepEqual(contractEvidenceIds(parsed), ["req-1"])
})

test("ProductContract rejects an untrusted shape", () => {
  const result = ProductContractSchema.safeParse({ ...contract, productType: "unknown" })
  assert.equal(result.success, false)
})
