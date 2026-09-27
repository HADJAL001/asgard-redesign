import assert from "node:assert/strict"
import test from "node:test"
import { signProductContract } from "../lib/product-contract-attestation.ts"
import { buildProductContractRequirements } from "../lib/product-contract-requirements.ts"
import { buildDirectorBrief, directorPlanFromTaskInput, normalizeBlueprintBuildContract } from "../backend/src/services/product-contract.ts"

process.env.PRODUCT_CONTRACT_SIGNING_KEY = "local-product-contract-test-signing-key"

const unsigned = {
  version: "1.0.0",
  source: {
    blueprintId: "e3ec2f99-0b79-49c1-8c19-e095d19a53ff",
    tenantId: "tenant-42",
    revision: 3,
    contractHash: "a".repeat(64),
  },
  brief: "Marketplace for independent designers to sell digital assets.",
  contract: {
    version: "1.0.0",
    productType: "marketplace",
    designDNA: { preset: "futuristic", tokens: {} },
    workflows: [{ id: "primary-outcome", actor: "Independent designers", success: "Publish and sell digital assets", risk: "medium" }],
    requirements: [{ id: "listing-flow", text: "Creators can publish listings", evidence: [{ id: "blueprint:e3ec2f99:r3", kind: "requirement", hash: "a".repeat(64) }] }],
    gates: ["typecheck", "unit", "a11y", "security", "performance", "visual-diff"],
    provenance: { sourceMemoryIds: [], createdBy: "ai-cofounder" },
  },
  storyboard: { components: ["app-shell", "marketplace-catalog", "preview-frame"] },
  architecture: { summary: "Catalog, creator profiles, and checkout flow", risks: ["Payment provider credentials are not configured"] },
}

test("the approved typed contract reaches the actual generation-agent brief with provenance", () => {
  const input = { ...unsigned, attestation: signProductContract(unsigned) }
  const contract = normalizeBlueprintBuildContract(input)
  const brief = buildDirectorBrief(contract, "Delivery provider: vercel.")

  assert.match(brief, /OSGARD DIRECTOR SPEC/)
  assert.match(brief, /\"productType\":\"marketplace\"/)
  assert.match(brief, /\"preset\":\"futuristic\"/)
  assert.match(brief, /marketplace-catalog/)
  assert.match(brief, /e3ec2f99-0b79-49c1-8c19-e095d19a53ff/)
  assert.match(brief, /tenant-42/)
  assert.match(brief, /credentials are not configured/)
  assert.match(brief, /only use configured, verified adapters/)
})

test("the backend rejects altered contracts and untrusted ProductContract shapes", () => {
  const valid = { ...unsigned, attestation: signProductContract(unsigned) }
  assert.throws(() => normalizeBlueprintBuildContract({ ...valid, brief: "Changed after signing" }), /invalid_product_contract_attestation/)
  assert.throws(() => normalizeBlueprintBuildContract({ ...valid, contract: { ...unsigned.contract, productType: "unknown" } }))
})

test("the generation handoff fails closed without a signing key", () => {
  const key = process.env.PRODUCT_CONTRACT_SIGNING_KEY
  delete process.env.PRODUCT_CONTRACT_SIGNING_KEY
  assert.throws(() => normalizeBlueprintBuildContract({ ...unsigned, attestation: { algorithm: "HMAC-SHA256", signature: "0".repeat(64) } }), /product_contract_attestation_unavailable/)
  process.env.PRODUCT_CONTRACT_SIGNING_KEY = key
})

test("the task context exposes the validated director plan to pipeline adapters", () => {
  const productContract = { ...unsigned, attestation: signProductContract(unsigned) }
  const plan = directorPlanFromTaskInput({ name: "Designers Market", description: "approved director brief", productContract })
  assert.equal(plan.contract.productType, "marketplace")
  assert.equal(plan.contract.designDNA.preset, "futuristic")
  assert.equal(plan.source.revision, 3)
})

test("user constraints become distinct requirements with the blueprint revision provenance", () => {
  const requirements = buildProductContractRequirements({
    blueprintId: unsigned.source.blueprintId,
    revision: unsigned.source.revision,
    contractHash: unsigned.source.contractHash,
    outcome: "Launch a verified marketplace",
    brief: unsigned.brief,
    constraints: ["WCAG AA", "Mobile-first", "Use the existing Supabase project"],
    components: ["marketplace-catalog"],
  })

  assert.deepEqual(requirements.map((requirement) => requirement.id), [
    "primary-outcome", "user-constraint-1", "user-constraint-2", "user-constraint-3", "storyboard-1-marketplace-catalog",
  ])
  assert.match(requirements[1].text, /WCAG AA/)
  assert.match(requirements[2].text, /Mobile-first/)
  assert.equal(requirements[3].evidence[0].id, `blueprint:${unsigned.source.blueprintId}:r${unsigned.source.revision}`)
  assert.equal(requirements[3].evidence[0].hash, unsigned.source.contractHash)
})
