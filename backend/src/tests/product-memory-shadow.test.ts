import assert from "node:assert/strict"
import test from "node:test"

test("Product memory shadow is disabled without both explicit production flags", async () => {
  const previousFlag = process.env.OSGARD_PRODUCT_SHADOW_WRITE
  const previousUrl = process.env.OSGARD_PRODUCT_POSTGRES_URL
  delete process.env.OSGARD_PRODUCT_SHADOW_WRITE
  delete process.env.OSGARD_PRODUCT_POSTGRES_URL
  const { getProductMemoryStatus, isProductMemoryObservationEnabled, isProductMemoryShadowEnabled, shadowProductMemory } = await import("../services/product-memory-shadow")
  assert.equal(isProductMemoryShadowEnabled(), false)
  assert.equal(isProductMemoryObservationEnabled(), false)
  const outcome = await shadowProductMemory("osgardnewworld", { tenantId: "osgardnewworld", blueprint: { id: "11111111-1111-4111-8111-111111111111", revision: 1, contractVersion: "1.0.0", contractHash: "a".repeat(64), app: "test", preset: "futuristic", brief: "A durable contract", components: [], generatedAt: new Date().toISOString() }, evidence: [] })
  assert.deepEqual(outcome, { status: "disabled" })
  const status = await getProductMemoryStatus()
  assert.deepEqual(status.counts, { contracts: 0, evidence: 0, nodes: 0, edges: 0 })
  assert.equal(status.databaseConfigured, false)
  assert.equal(status.meaningfulBaseline, false)
  assert.equal(status.cutoverAllowed, false)
  if (previousFlag === undefined) delete process.env.OSGARD_PRODUCT_SHADOW_WRITE
  else process.env.OSGARD_PRODUCT_SHADOW_WRITE = previousFlag
  if (previousUrl === undefined) delete process.env.OSGARD_PRODUCT_POSTGRES_URL
  else process.env.OSGARD_PRODUCT_POSTGRES_URL = previousUrl
})
