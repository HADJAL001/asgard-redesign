import assert from "node:assert/strict"
import test from "node:test"
import { buildPreviewSession } from "../lib/preview-session.ts"

const blueprint = {
  id: "11111111-1111-4111-8111-111111111111", tenantId: "osgardnewworld", revision: 1, app: "preview-check", preset: "futuristic", contractHash: "a".repeat(64), brief: "A usable preview session backed by the same ProductContract.", components: ["hero", "preview-frame"], stages: ["intent", "preview"], generatedAt: "2026-09-28T00:00:00.000Z", arbitraryHtml: false, quality: { score: 90, warnings: [], humanReviewRequired: false },
}
const timing = { id: "preview-timing-1", blueprintId: blueprint.id, tenantId: blueprint.tenantId, revision: 1, contractHash: blueprint.contractHash, firstReadyAt: "2026-09-28T00:00:04.000Z", firstReadyDurationMs: 4000, lastRequestedAt: "2026-09-28T00:00:04.000Z" }

test("marks a contract preview ready while keeping an ungenerated runtime explicit", () => {
  const session = buildPreviewSession(blueprint, timing)
  assert.equal(session.contractPreview.status, "ready")
  assert.deepEqual(session.runtime, { status: "unavailable", source: "generation", reason: "generation_not_started" })
  assert.equal(session.timing.withinTarget, true)
})

test("only exposes a verified TLS preview artifact", () => {
  const session = buildPreviewSession({ ...blueprint, generation: { taskId: "task-1", status: "completed", progress: 100, result: { previewUrl: "https://preview.example.com/build/1" }, artifactSeal: { digest: "x", signedAt: "2026-09-28T00:00:02.000Z" }, updatedAt: "2026-09-28T00:00:02.000Z" } }, timing)
  assert.deepEqual(session.runtime, { status: "ready", source: "signed-generation-artifact", url: "https://preview.example.com/build/1" })
})

test("never exposes local or unsigned generation URLs", () => {
  const local = buildPreviewSession({ ...blueprint, generation: { taskId: "task-1", status: "completed", progress: 100, result: { previewUrl: "http://127.0.0.1:3000" }, artifactSeal: { digest: "x", signedAt: "2026-09-28T00:00:02.000Z" }, updatedAt: "2026-09-28T00:00:02.000Z" } }, timing)
  assert.deepEqual(local.runtime, { status: "unavailable", source: "generation", reason: "signed_preview_url_required" })
  const unsigned = buildPreviewSession({ ...blueprint, generation: { taskId: "task-2", status: "completed", progress: 100, result: { previewUrl: "https://preview.example.com/build/2" }, updatedAt: "2026-09-28T00:00:02.000Z" } }, timing)
  assert.equal(unsigned.runtime.status, "unavailable")
})
