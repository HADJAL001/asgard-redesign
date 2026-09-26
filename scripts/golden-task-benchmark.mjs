/**
 * OSGARD golden-task benchmark.
 *
 * This is a product-path check, not a synthetic HTTP ping. It creates one
 * tenant-scoped disposable blueprint and verifies the workflow that matters:
 * intent -> preview -> natural-language diff -> approval-room comment -> replay.
 * Run with GOLDEN_TASK_BASE_URL to target a staging checkout; the default is
 * the only production domain in scope.
 */
const base = (process.env.GOLDEN_TASK_BASE_URL || "https://osgardnewworld.com").replace(/\/$/, "")
const startedAt = Date.now()
const results = []

async function request(path, options = {}) {
  const started = Date.now()
  const response = await fetch(`${base}${path}`, options)
  const payload = await response.json().catch(() => null)
  const result = { path, status: response.status, ok: response.ok, latencyMs: Date.now() - started }
  results.push(result)
  return { response, payload, result }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const created = await request("/api/design/blueprint", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    app: `golden-task-${Date.now()}`,
    brief: "A marketplace for independent designers with a clear first purchase path and mobile-ready cards.",
    intent: { audience: "Independent designers", outcome: "Publish and sell a first product", platform: "web", constraints: ["mobile-first", "WCAG AA"] },
    productType: "marketplace",
    preset: "futuristic",
  }),
})
assert(created.response.ok && created.payload?.blueprint?.id, "create_contract failed")
const blueprint = created.payload.blueprint
const evidenceToken = created.payload.evidenceToken
assert(typeof evidenceToken === "string", "evidence token missing")

const preview = await request(`/api/design/blueprint/${blueprint.id}/preview?revision=${blueprint.revision}`)
assert(preview.response.ok && preview.payload?.renderPlan?.slots?.length, "visual_storyboard failed")
assert(preview.result.latencyMs < 60_000, `live_preview exceeded 60s (${preview.result.latencyMs}ms)`)

const commandCases = [
  { command: "сделай карточки плотнее", intent: "dense" },
  { command: "сделай мобильную версию", intent: "mobile" },
  { command: "добавь Stripe", intent: "stripe" },
]
for (const commandCase of commandCases) {
  const command = await request(`/api/design/blueprint/${blueprint.id}/command`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ revision: blueprint.revision, command: commandCase.command, dryRun: true }),
  })
  assert(
    command.response.ok && command.payload?.dryRun === true && command.payload?.intent === commandCase.intent && command.payload.changes?.length > 0,
    `explainable_diff failed for ${commandCase.intent}`,
  )
}

const appliedCommand = await request(`/api/design/blueprint/${blueprint.id}/command`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ revision: blueprint.revision, command: commandCases[0].command, dryRun: false, evidenceToken }),
})
assert(appliedCommand.response.status === 201 && appliedCommand.payload?.blueprint?.revision === blueprint.revision + 1, "command_revision_apply failed")
const activeBlueprint = appliedCommand.payload.blueprint

const delivery = await request(`/api/design/blueprint/${blueprint.id}/delivery`, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ revision: activeBlueprint.revision, provider: "osgard-cluster", domain: "golden-task.example.com", supabaseProjectRef: "golden-task-ref", evidenceToken }),
})
assert(delivery.response.ok && delivery.payload?.delivery?.supabaseProjectRef === "golden-task-ref", "delivery_wizard failed")

const deliveryVerification = await request(`/api/design/blueprint/${blueprint.id}/delivery/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ revision: activeBlueprint.revision, evidenceToken }),
})
const deliveryVerificationAvailable = deliveryVerification.response.ok && Array.isArray(deliveryVerification.payload?.checks)
assert(deliveryVerificationAvailable || deliveryVerification.response.status === 404, "delivery_verification failed")

const comment = await request(`/api/design/blueprint/${blueprint.id}/comments`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ revision: activeBlueprint.revision, author: "golden-task", comment: "Approve mobile-first purchase path after visual review.", evidenceToken }),
})
assert(comment.response.ok && comment.payload?.comment?.body, "approval_room failed")

const replay = await request(`/cofounder/replay/${blueprint.id}?revision=${activeBlueprint.revision}`)
assert(replay.response.ok, "mission_replay failed")

const totalMs = Date.now() - startedAt
const output = {
  base,
  totalMs,
  gates: {
    contract: "passed",
    storyboard: "passed",
    livePreviewUnder60s: "passed",
    explainableDiff: "passed",
    naturalLanguageCommands: "passed",
    deliveryWizard: "passed",
    deliveryVerification: deliveryVerificationAvailable ? "passed" : "pending_deploy",
    approvalRoom: "passed",
    replay: "passed",
  },
  targetBudgets: { livePreviewMs: 60_000, workflowMs: 120_000 },
  withinWorkflowBudget: totalMs < 120_000,
  requests: results,
  blueprintId: blueprint.id,
}
if (!output.withinWorkflowBudget) throw new Error(`golden workflow exceeded 120s (${totalMs}ms)`)
console.log(JSON.stringify(output, null, 2))
