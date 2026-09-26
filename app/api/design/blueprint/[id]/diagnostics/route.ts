import { NextRequest, NextResponse } from "next/server"
import { appendBlueprintErrorRun, getBlueprint, listBlueprintEvidence, listBlueprintErrorRuns, type BlueprintEvidenceKind } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"
import { verifyArtifactSeal } from "@/lib/artifact-seal"

export const dynamic = "force-dynamic"

type Finding = {
  id: string
  fingerprint: string
  category: "quality" | "evidence" | "delivery" | "approval" | "sandbox"
  severity: "low" | "medium" | "high"
  confidence: number
  title: string
  detail: string
  source: string
  nextAction: "review" | "refresh-evidence" | "configure-delivery" | "approve-preview"
  blocking: boolean
  autoRepairEligible: boolean
  evidenceRefs: string[]
}

function normalizeFingerprint(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96)
}

async function scan(request: NextRequest, id: string) {
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })

  const evidence = listBlueprintEvidence(id, tenantId)
  const latest = new Map(evidence.map((entry) => [entry.kind, entry]))
  const findings: Finding[] = []
  const add = (finding: Omit<Finding, "id">) => findings.push({ ...finding, id: `${finding.fingerprint}:${blueprint.revision}` })

  if (blueprint.quality.score < 85) add({ fingerprint: "quality.score-below-threshold", category: "quality", severity: blueprint.quality.score < 70 ? "high" : "medium", confidence: 1, title: "Blueprint quality needs review", detail: `Quality score is ${blueprint.quality.score}/100; human review is required before codegen.`, source: "product-contract-quality", nextAction: "review", blocking: blueprint.quality.score < 70, autoRepairEligible: false, evidenceRefs: [] })
  for (const warning of blueprint.quality.warnings.slice(0, 8)) add({ fingerprint: `quality.warning:${normalizeFingerprint(warning)}`, category: "quality", severity: "medium", confidence: 0.98, title: "Quality warning", detail: warning, source: "product-contract-quality", nextAction: "review", blocking: true, autoRepairEligible: false, evidenceRefs: [] })

  const requiredKinds: BlueprintEvidenceKind[] = ["security", "performance", "a11y", "visual-diff", "deploy"]
  for (const kind of requiredKinds) {
    const entry = latest.get(kind)
    if (!entry || entry.revision !== blueprint.revision || entry.contractHash !== blueprint.contractHash || entry.status !== "passed") add({ fingerprint: `evidence.${kind}`, category: "evidence", severity: kind === "security" ? "high" : "medium", confidence: 1, title: `${kind} evidence is not current`, detail: !entry ? "No evidence was recorded for this revision." : `Evidence is ${entry.status}, stale, or bound to another contract hash.`, source: "evidence-ledger", nextAction: "refresh-evidence", blocking: true, autoRepairEligible: false, evidenceRefs: entry ? [entry.id] : [] })
  }
  if (!blueprint.delivery) add({ fingerprint: "delivery.policy-missing", category: "delivery", severity: "high", confidence: 1, title: "Delivery target is not configured", detail: "Code generation cannot be published until a provider and delivery policy are configured.", source: "delivery-policy", nextAction: "configure-delivery", blocking: true, autoRepairEligible: false, evidenceRefs: [] })
  if (blueprint.delivery && blueprint.approval?.status !== "approved") add({ fingerprint: "approval.preview-pending", category: "approval", severity: "medium", confidence: 1, title: "Preview approval is pending", detail: "A collaborator must approve this exact revision before codegen.", source: "approval-room", nextAction: "approve-preview", blocking: true, autoRepairEligible: false, evidenceRefs: [] })
  const generation = blueprint.generation
  if (generation?.status === "failed") add({ fingerprint: "sandbox.generation-failed", category: "sandbox", severity: "high", confidence: 1, title: "Sandbox generation failed", detail: generation.error || "The isolated generation task reported a failure.", source: "generation-task", nextAction: "review", blocking: true, autoRepairEligible: false, evidenceRefs: [] })
  if (generation?.status === "completed") {
    const sealed = Boolean(generation.artifactSeal && generation.result && verifyArtifactSeal({ blueprintId: id, tenantId, revision: blueprint.revision, contractHash: blueprint.contractHash || "", taskId: generation.taskId, result: generation.result }, generation.artifactSeal))
    if (!sealed) add({ fingerprint: "sandbox.artifact-unsealed", category: "sandbox", severity: "high", confidence: 1, title: "Completed artifact is not cryptographically sealed", detail: "The generation result cannot be trusted until its artifact signature verifies for this tenant, revision, and contract hash.", source: "artifact-provenance", nextAction: "review", blocking: true, autoRepairEligible: false, evidenceRefs: latest.get("artifact-signature") ? [latest.get("artifact-signature")!.id] : [] })
  }

  const run = { id: `error-run:${id}:${blueprint.revision}:${Date.now()}`, blueprintId: id, revision: blueprint.revision, contractHash: blueprint.contractHash || "", status: findings.some((finding) => finding.blocking && finding.severity === "high") ? "blocked" as const : findings.length ? "needs-review" as const : "passed" as const, findingCount: findings.length, phases: ["contract", "evidence", "sandbox", "delivery", "approval"].map((phase) => ({ phase, status: findings.some((finding) => finding.category === phase || (phase === "contract" && finding.category === "quality")) ? "attention" : "passed" })) }
  appendBlueprintErrorRun({ ...run, tenantId, findings, capturedAt: new Date().toISOString() })
  const history = listBlueprintErrorRuns(id, tenantId).slice(-20).map((entry) => ({ id: entry.id, status: entry.status, findingCount: entry.findingCount, capturedAt: entry.capturedAt, revision: entry.revision }))
  return NextResponse.json({ version: "1.1.0", run, history, findings, policy: { autoRepair: ["missing-accessible-label", "deterministic-import", "type-error", "formatting"], maxRepairAttempts: 3, approvalRequiredFor: ["security", "data-migration", "provider", "infrastructure"], repairMode: "proposal-only" } }, { headers: { "cache-control": "no-store" } })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return scan(request, id)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!request.headers.get("content-type")?.includes("application/json")) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const body = await request.json().catch(() => null) as { action?: unknown } | null
  if (body?.action !== "recheck") return NextResponse.json({ error: "unsupported_diagnostics_action", allowed: ["recheck"] }, { status: 400 })
  return scan(request, id)
}
