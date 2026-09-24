import { NextRequest, NextResponse } from "next/server"
import { getBlueprint, latestBlueprintEvidence } from "@/lib/blueprint-store"

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
  const securityEvidence = latestBlueprintEvidence(id, "security")
  const performanceEvidence = latestBlueprintEvidence(id, "performance")
  if (!securityEvidence || securityEvidence.contractHash !== blueprint.contractHash || securityEvidence.status !== "passed") return NextResponse.json({ error: "security_evidence_required" }, { status: 409 })
  if (!performanceEvidence || performanceEvidence.contractHash !== blueprint.contractHash || performanceEvidence.status !== "passed") return NextResponse.json({ error: "performance_evidence_required" }, { status: 409 })
  if (!BACKEND_URL) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const response = await fetch(`${BACKEND_URL}/generate-project`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${access}` }, body: JSON.stringify({ name: blueprint.app, description: `${blueprint.brief}\n\nApproved design components: ${blueprint.components.join(", ")}.` }), signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!response) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const payload = await response.text()
  return new NextResponse(payload, { status: response.status, headers: { "content-type": response.headers.get("content-type") || "application/json", "cache-control": "no-store" } })
}
