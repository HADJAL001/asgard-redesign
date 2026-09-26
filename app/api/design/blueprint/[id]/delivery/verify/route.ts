import { NextRequest, NextResponse } from "next/server"
import crypto from "node:crypto"
import { appendBlueprintEvidence, getBlueprint, listBlueprintEvidence, verifyBlueprintEvidenceToken } from "@/lib/blueprint-store"
import { tenantIdFromRequest } from "@/lib/tenant-context"

export const dynamic = "force-dynamic"

type Check = { id: string; status: "passed" | "failed" | "manual" | "not-requested"; label: string }
const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

async function withTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(8_000), cache: "no-store" })
  } catch {
    return null
  }
}

async function verifyDomain(domain: string): Promise<Check> {
  if (!/^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) return { id: "domain", status: "failed", label: "Stored domain failed validation" }
  const response = await withTimeout(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=A`, { headers: { accept: "application/dns-json" } })
  if (!response?.ok) return { id: "domain", status: "failed", label: `DNS lookup unavailable for ${domain}` }
  const payload = await response.json().catch(() => null) as { Answer?: unknown[] } | null
  return { id: "domain", status: Array.isArray(payload?.Answer) && payload.Answer.length > 0 ? "passed" : "manual", label: Array.isArray(payload?.Answer) && payload.Answer.length > 0 ? `DNS resolves for ${domain}` : `DNS record not visible yet for ${domain}` }
}

async function verifySupabase(projectRef: string): Promise<Check> {
  if (!/^[a-z0-9-]{8,80}$/i.test(projectRef)) return { id: "supabase", status: "failed", label: "Supabase project reference is invalid" }
  const response = await withTimeout(`https://${projectRef}.supabase.co/rest/v1/`, { method: "HEAD" })
  // A 401/403 is expected without a project key and proves that the endpoint is reachable.
  const reachable = Boolean(response && (response.ok || response.status === 401 || response.status === 403))
  return { id: "supabase", status: reachable ? "passed" : "failed", label: reachable ? "Supabase endpoint is reachable" : "Supabase endpoint could not be reached" }
}

async function verifyIntegrations(ids: number[], request: NextRequest): Promise<Check> {
  if (!ids.length) return { id: "integrations", status: "not-requested", label: "No infrastructure adapters selected" }
  const access = request.cookies.get("osgard_access")?.value
  if (!BACKEND_URL || !access) return { id: "integrations", status: "failed", label: "Infrastructure adapter session is unavailable" }
  const response = await withTimeout(`${BACKEND_URL}/integrations`, { headers: { authorization: `Bearer ${access}` } })
  if (!response?.ok) return { id: "integrations", status: "failed", label: "Could not read selected infrastructure adapters" }
  const payload = await response.json().catch(() => null) as { integrations?: Array<{ id: number; status?: string; lastTestStatus?: string | null }> } | null
  const records = Array.isArray(payload?.integrations) ? payload.integrations : []
  const selected = ids.map((id) => records.find((item) => item.id === id))
  const ready = selected.length === ids.length && selected.every((item) => item?.status === "active" && item.lastTestStatus === "passed")
  return { id: "integrations", status: ready ? "passed" : "failed", label: ready ? `${ids.length} infrastructure adapter(s) verified` : "Selected adapters must be active and pass their latest test" }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tenantId = tenantIdFromRequest(request)
  if (!tenantId) return NextResponse.json({ error: "tenant_not_available" }, { status: 404 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const revision = Number(body?.revision)
  const blueprint = getBlueprint(id, Number.isInteger(revision) && revision > 0 ? revision : undefined, tenantId)
  if (!blueprint) return NextResponse.json({ error: "blueprint_revision_not_found" }, { status: 404 })
  if (!verifyBlueprintEvidenceToken(id, body?.evidenceToken, tenantId)) return NextResponse.json({ error: "evidence_token_required" }, { status: 403 })
  const checks: Check[] = [{ id: "provider", status: blueprint.delivery ? "passed" : "failed", label: blueprint.delivery ? `${blueprint.delivery.provider} target recorded` : "Delivery target is missing" }]
  if (blueprint.delivery?.domain) checks.push(await verifyDomain(blueprint.delivery.domain))
  else checks.push({ id: "domain", status: "not-requested", label: "Custom domain not requested" })
  if (blueprint.delivery?.supabaseProjectRef) checks.push(await verifySupabase(blueprint.delivery.supabaseProjectRef))
  else checks.push({ id: "supabase", status: "not-requested", label: "Supabase project not requested" })
  checks.push(await verifyIntegrations(blueprint.delivery?.integrationIds || [], request))
  const recorded = listBlueprintEvidence(id, tenantId)
  for (const check of checks.filter((item) => item.id === "domain" || item.id === "supabase" || item.id === "integrations")) {
    if (check.status === "not-requested") continue
    const kind = check.id === "domain" ? "dns-verification" : check.id === "supabase" ? "supabase-verification" : "integration-verification"
    const status = check.status === "passed" ? "passed" : check.status === "failed" ? "failed" : "skipped"
    const summary = check.label
    const exists = recorded.some((entry) => entry.kind === kind && entry.revision === blueprint.revision && entry.status === status && entry.summary === summary)
    if (!exists) appendBlueprintEvidence({ id: crypto.randomUUID(), blueprintId: id, tenantId, revision: blueprint.revision, contractHash: blueprint.contractHash || "", kind, status, summary, capturedAt: new Date().toISOString(), source: "delivery-read-only-verification" })
  }
  return NextResponse.json({ blueprintId: id, revision: blueprint.revision, verifiedAt: new Date().toISOString(), checks, ready: checks.every((check) => check.status === "passed" || check.status === "not-requested") }, { headers: { "cache-control": "no-store" } })
}
