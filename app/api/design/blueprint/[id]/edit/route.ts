import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendBlueprintEvidence, getBlueprint, listBlueprintRevisions, saveBlueprint, verifyBlueprintEvidenceToken, type StoredBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

const allowed = new Set(["app-shell", "hero", "bento-grid", "form-wizard", "preview-frame", "cinematic-sequence"])
const maxBytes = 24_000

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  if (request.headers.get("content-type")?.includes("application/json") !== true) return NextResponse.json({ error: "json_required" }, { status: 415 })
  const raw = await request.text()
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return NextResponse.json({ error: "edit_payload_too_large", maxBytes }, { status: 413 })
  let body: { revision?: unknown; evidenceToken?: unknown; slots?: unknown } = {}
  try { body = JSON.parse(raw) as typeof body } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const revision = Number(body.revision)
  const source = getBlueprint(id, revision, tenantId)
  if (!source) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body.evidenceToken, tenantId)) return NextResponse.json({ error: "invalid_evidence_token" }, { status: 403 })
  if (!Array.isArray(body.slots) || body.slots.length < 1 || body.slots.length > 12) return NextResponse.json({ error: "invalid_canvas_slots" }, { status: 400 })
  const slots = body.slots.map((value) => {
    const item = value && typeof value === "object" ? value as Record<string, unknown> : {}
    const component = typeof item.component === "string" ? item.component : ""
    const role = typeof item.role === "string" ? item.role.trim().slice(0, 120) : ""
    const states = Array.isArray(item.states) ? item.states.filter((state): state is string => typeof state === "string").map((state) => state.slice(0, 40)).slice(0, 8) : []
    return { id: typeof item.id === "string" ? item.id.slice(0, 80) : "", component, role, states }
  })
  if (slots.some((slot) => !slot.id || !allowed.has(slot.component) || !slot.role || !slot.states.length) || new Set(slots.map((slot) => slot.id)).size !== slots.length) return NextResponse.json({ error: "canvas_slot_not_allowed" }, { status: 400 })
  const components = slots.map((slot) => slot.component)
  const contract = { version: source.contractVersion || "1.0.0", app: source.app, productType: source.productType, preset: source.preset, brief: source.brief, components, aiPlan: source.aiPlan || null, canvasSlots: slots }
  const contractHash = crypto.createHash("sha256").update(JSON.stringify(contract)).digest("hex")
  const latest = listBlueprintRevisions(id, tenantId).at(-1)
  const edited: StoredBlueprint = { ...source, revision: (latest?.revision || source.revision) + 1, contractHash, canvasSlots: slots, components, generatedAt: new Date().toISOString(), approval: undefined, quality: { ...source.quality, humanReviewRequired: true } }
  saveBlueprint(edited)
  const evidence = appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision: edited.revision, contractHash, kind: "rollback", status: "passed", summary: `Canvas draft saved as revision ${edited.revision}; approval and quality evidence reset`, capturedAt: new Date().toISOString(), source: "blueprint-canvas-edit" })
  return NextResponse.json({ blueprint: edited, evidence }, { status: 201, headers: { "cache-control": "no-store" } })
}
