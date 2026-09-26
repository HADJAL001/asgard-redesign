import assert from "node:assert/strict"
import test from "node:test"

const { createArtifactSeal, verifyArtifactSeal } = await import("../lib/artifact-seal.ts")

const input = {
  blueprintId: "00000000-0000-4000-8000-000000000001",
  tenantId: "tenant-a",
  revision: 4,
  contractHash: "a".repeat(64),
  taskId: "task-42",
  result: { previewUrl: "https://preview.osgardnewworld.com/demo", appUrl: "https://demo.example.com" },
}

test("artifact seal is verifiable and bound to the complete generation identity", () => {
  const previous = process.env.ARTIFACT_SIGNING_KEY
  process.env.ARTIFACT_SIGNING_KEY = "unit-test-artifact-key-with-32-bytes"
  const seal = createArtifactSeal(input, "2026-09-26T00:00:00.000Z")
  assert.ok(seal)
  assert.equal(verifyArtifactSeal(input, seal), true)
  assert.equal(verifyArtifactSeal({ ...input, tenantId: "tenant-b" }, seal), false)
  assert.equal(verifyArtifactSeal({ ...input, revision: 5 }, seal), false)
  assert.equal(verifyArtifactSeal({ ...input, result: { ...input.result, appUrl: "https://tampered.example.com" } }, seal), false)
  if (previous === undefined) delete process.env.ARTIFACT_SIGNING_KEY
  else process.env.ARTIFACT_SIGNING_KEY = previous
})

test("missing signing configuration never reports a signed artifact", () => {
  const previous = process.env.ARTIFACT_SIGNING_KEY
  delete process.env.ARTIFACT_SIGNING_KEY
  assert.equal(createArtifactSeal(input), null)
  if (previous === undefined) delete process.env.ARTIFACT_SIGNING_KEY
  else process.env.ARTIFACT_SIGNING_KEY = previous
})

test("short signing configuration never reports a signed artifact", () => {
  const previous = process.env.ARTIFACT_SIGNING_KEY
  process.env.ARTIFACT_SIGNING_KEY = "too-short"
  assert.equal(createArtifactSeal(input), null)
  if (previous === undefined) delete process.env.ARTIFACT_SIGNING_KEY
  else process.env.ARTIFACT_SIGNING_KEY = previous
})
