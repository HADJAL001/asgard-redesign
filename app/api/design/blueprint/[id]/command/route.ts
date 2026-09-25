import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendBlueprintEvidence, getBlueprint, listBlueprintRevisions, saveBlueprint, verifyBlueprintEvidenceToken, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

const MAX_BYTES = 8_000
const allowed = new Set(["app-shell", "hero", "bento-grid", "form-wizard", "preview-frame", "cinematic-sequence"])
type Slot = NonNullable<StoredBlueprint["canvasSlots"]>[number]

function boundedText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function slotsFor(blueprint: StoredBlueprint): Slot[] {
  if (blueprint.canvasSlots?.length) return blueprint.canvasSlots
  return blueprint.components.map((component, index) => ({ id: `slot-${index + 1}`, component, role: component.replace(/-/g, " "), states: ["default", "responsive"] }))
}

function interpret(command: string, source: Slot[]) {
  const normalized = command.toLocaleLowerCase("ru-RU")
  const next = source.map((slot) => ({ ...slot, states: [...slot.states] }))
  let intent: "dense" | "stripe" | "mobile"
  if (/плотн|dense|compact/.test(normalized)) intent = "dense"
  else if (/stripe|оплат|платеж/.test(normalized)) intent = "stripe"
  else if (/мобиль|mobile|адаптив/.test(normalized)) intent = "mobile"
  else return null

  if (intent === "dense") {
    next.forEach((slot) => { if (!slot.states.includes("dense layout")) slot.states.push("dense layout") })
  } else if (intent === "mobile") {
    next.forEach((slot) => { if (!slot.states.includes("mobile-ready")) slot.states.push("mobile-ready") })
  } else {
    const target = next.find((slot) => slot.component === "form-wizard") || next[0]
    if (target && !target.states.includes("Stripe payments")) target.states.push("Stripe payments")
  }
  return { intent, slots: next }
}

function contractHash(source: StoredBlueprint, slots: Slot[]) {
  const contract = { version: source.contractVersion || "1.0.0", app: source.app, productType: source.productType, preset: source.preset, brief: source.brief, intent: source.intent || null, components: slots.map((slot) => slot.component), aiPlan: source.aiPlan || null, canvasSlots: slots }
  return crypto.createHash("sha256").update(JSON.stringify(contract)).digest("hex")
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return NextResponse.json({ error: "command_payload_too_large", maxBytes: MAX_BYTES }, { status: 413 })
  let body: { revision?: unknown; command?: unknown; dryRun?: unknown; evidenceToken?: unknown } = {}
  try { body = JSON.parse(raw) as typeof body } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const revision = Number(body.revision)
  const source = getBlueprint(id, Number.isInteger(revision) && revision > 0 ? revision : undefined, tenantId)
  if (!source) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  const command = boundedText(body.command, 500)
  if (command.length < 3) return NextResponse.json({ error: "command_too_short" }, { status: 400 })
  const original = slotsFor(source)
  const interpretation = interpret(command, original)
  if (!interpretation) return NextResponse.json({ error: "command_not_supported", supported: ["dense_cards", "add_stripe", "mobile_version"] }, { status: 422 })
  if (interpretation.slots.some((slot) => !allowed.has(slot.component))) return NextResponse.json({ error: "canvas_slot_not_allowed" }, { status: 409 })
  const changes = interpretation.slots.flatMap((slot, index) => {
    const before = original[index]?.states.join(", ") || ""
    const after = slot.states.join(", ")
    return before === after ? [] : [{ slotId: slot.id, role: slot.role, before, after }]
  })
  const nextHash = contractHash(source, interpretation.slots)
  const dryRun = body.dryRun !== false
  if (dryRun) return NextResponse.json({ dryRun: true, blueprintId: id, revision: source.revision, intent: interpretation.intent, contractHash: nextHash, changes, proposedSlots: interpretation.slots }, { headers: { "cache-control": "no-store" } })
  if (!verifyBlueprintEvidenceToken(id, body.evidenceToken, tenantId)) return NextResponse.json({ error: "invalid_evidence_token" }, { status: 403 })
  const revisions = listBlueprintRevisions(id, tenantId)
  const edited: StoredBlueprint = { ...source, revision: (revisions.at(-1)?.revision || source.revision) + 1, contractHash: nextHash, canvasSlots: interpretation.slots, components: interpretation.slots.map((slot) => slot.component), generatedAt: new Date().toISOString(), approval: undefined, quality: { ...source.quality, humanReviewRequired: true } }
  saveBlueprint(edited)
  const evidence = appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision: edited.revision, contractHash: nextHash, kind: "remediation", status: "passed", summary: `Natural-language command applied (${interpretation.intent}); revision ${edited.revision} requires quality gates`, capturedAt: new Date().toISOString(), source: "blueprint-command" })
  return NextResponse.json({ dryRun: false, blueprint: edited, intent: interpretation.intent, changes, evidence }, { status: 201, headers: { "cache-control": "no-store" } })
}
