import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintEvidence, type BlueprintEvidenceKind } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

type Finding = {
  id: string
  fingerprint: string
  category: "quality" | "evidence" | "delivery" | "approval"
  severity: "low" | "medium" | "high"
  confidence: number
  title: string
  detail: string
  source: string
  nextAction: "review" | "refresh-evidence" | "configure-delivery" | "approve-preview"
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const blueprint = getBlueprint(id, undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })

  const evidence = listBlueprintEvidence(id, tenantId)
  const latest = new Map(evidence.map((entry) => [entry.kind, entry]))
  const findings: Finding[] = []
  const add = (finding: Omit<Finding, "id">) => findings.push({ ...finding, id: `${finding.fingerprint}:${blueprint.revision}` })

  if (blueprint.quality.score < 85) add({ fingerprint: "quality.score-below-threshold", category: "quality", severity: blueprint.quality.score < 70 ? "high" : "medium", confidence: 1, title: "Blueprint quality needs review", detail: `Quality score is ${blueprint.quality.score}/100; human review is required before codegen.`, source: "product-contract-quality", nextAction: "review" })
  for (const warning of blueprint.quality.warnings.slice(0, 8)) add({ fingerprint: `quality.warning:${warning.slice(0, 80)}`, category: "quality", severity: "medium", confidence: 0.98, title: "Quality warning", detail: warning, source: "product-contract-quality", nextAction: "review" })

  const requiredKinds: BlueprintEvidenceKind[] = ["security", "performance", "a11y", "visual-diff", "deploy"]
  for (const kind of requiredKinds) {
    const entry = latest.get(kind)
    if (!entry || entry.revision !== blueprint.revision || entry.contractHash !== blueprint.contractHash || entry.status !== "passed") add({ fingerprint: `evidence.${kind}`, category: "evidence", severity: kind === "security" ? "high" : "medium", confidence: 1, title: `${kind} evidence is not current`, detail: !entry ? "No evidence was recorded for this revision." : `Evidence is ${entry.status}, stale, or bound to another contract hash.`, source: "evidence-ledger", nextAction: "refresh-evidence" })
  }
  if (!blueprint.delivery) add({ fingerprint: "delivery.policy-missing", category: "delivery", severity: "high", confidence: 1, title: "Delivery target is not configured", detail: "Code generation cannot be published until a provider and delivery policy are configured.", source: "delivery-policy", nextAction: "configure-delivery" })
  if (blueprint.delivery && blueprint.approval?.status !== "approved") add({ fingerprint: "approval.preview-pending", category: "approval", severity: "medium", confidence: 1, title: "Preview approval is pending", detail: "A collaborator must approve this exact revision before codegen.", source: "approval-room", nextAction: "approve-preview" })

  return NextResponse.json({ version: "1.0.0", run: { id: `error-run:${id}:${blueprint.revision}`, blueprintId: id, revision: blueprint.revision, contractHash: blueprint.contractHash, status: findings.some((finding) => finding.severity === "high") ? "blocked" : findings.length ? "needs-review" : "passed", findingCount: findings.length }, findings, policy: { autoRepair: ["missing-accessible-label", "deterministic-import", "type-error", "formatting"], maxRepairAttempts: 3, approvalRequiredFor: ["security", "data-migration", "provider", "infrastructure"] } }, { headers: { "cache-control": "no-store" } })
}
