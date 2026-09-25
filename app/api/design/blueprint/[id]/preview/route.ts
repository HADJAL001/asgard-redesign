import { NextRequest, NextResponse } from "next/server"
import { getBlueprint } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

const registry: Record<string, { role: string; states: string[] }> = {
  "app-shell": { role: "navigation", states: ["default", "loading", "error"] },
  hero: { role: "orientation", states: ["default", "reduced-motion"] },
  "bento-grid": { role: "overview", states: ["default", "empty", "loading"] },
  "form-wizard": { role: "input", states: ["default", "invalid", "submitting", "success"] },
  "preview-frame": { role: "proof", states: ["connecting", "ready", "failed", "retrying"] },
  "cinematic-sequence": { role: "progress", states: ["active", "complete", "paused"] },
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const rawRevision = request.nextUrl.searchParams.get("revision")
  const selectedRevision = rawRevision ? Number(rawRevision) : undefined
  if (rawRevision && (!Number.isInteger(selectedRevision) || (selectedRevision as number) < 1)) return NextResponse.json({ error: "invalid_revision" }, { status: 400 })
  const blueprint = getBlueprint(id, selectedRevision, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  const slots = (blueprint.canvasSlots || blueprint.components.map((component, index) => ({
    id: `${component}-${index + 1}`,
    component,
    role: registry[component]?.role || "content",
    states: registry[component]?.states || ["default"],
    order: index,
  }))).map((slot, index) => ({ ...slot, order: index }))
  return NextResponse.json({ version: "1.0.0", blueprintId: blueprint.id, revision: blueprint.revision, profile: { app: blueprint.app, preset: blueprint.preset }, renderPlan: { layout: "hull-fluid", grid: 12, slots, stages: blueprint.stages, arbitraryHtml: false }, quality: blueprint.quality, aiPlan: blueprint.aiPlan || null }, { headers: { "cache-control": "no-store" } })
}
