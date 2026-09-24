import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, listBlueprintEvidence, type BlueprintEvidenceKind } from "@/lib/blueprint-store"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "invalid_blueprint_id" }, { status: 400 })
  const access = request.cookies.get("osgard_access")?.value
  if (!access) return NextResponse.json({ error: "auth_required" }, { status: 401 })
  const blueprint = getBlueprint(id)
  if (!blueprint) return NextResponse.json({ error: "blueprint_not_found" }, { status: 404 })
  if (blueprint.approval?.status !== "approved") return NextResponse.json({ error: "blueprint_approval_required" }, { status: 409 })
  const required: BlueprintEvidenceKind[] = ["security", "performance", "a11y", "visual-diff", "deploy"]
  const latest = new Map(listBlueprintEvidence(id).map((entry) => [entry.kind, entry]))
  const missing = required.filter((kind) => latest.get(kind)?.contractHash !== blueprint.contractHash || latest.get(kind)?.status !== "passed")
  if (missing.length) return NextResponse.json({ error: "quality_evidence_required", missing }, { status: 409 })
  if (!BACKEND_URL) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const response = await fetch(`${BACKEND_URL}/generate-project`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access}` }, body: JSON.stringify({ name: blueprint.app, description: `${blueprint.brief}\n\nApproved design components: ${blueprint.components.join(", ")}.` }), signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!response) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const payload = await response.text()
  return new NextResponse(payload, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" } })
}
