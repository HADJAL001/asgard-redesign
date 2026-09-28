import { NextRequest, NextResponse } from "next/server"

type TenantBrand = {
  tenantId: string
  name: string
  logoUrl?: string
  accent?: string
  displayFont?: string
}

const defaultBrand: TenantBrand = {
  tenantId: "osgardnewworld",
  name: "OSGARD New World",
  accent: "#64D9E8",
  displayFont: "Space Grotesk Variable",
}

function readServerBrand(): TenantBrand {
  const raw = process.env.OSGARD_TENANT_BRAND_JSON
  if (!raw) return defaultBrand
  try {
    const value = JSON.parse(raw) as Partial<TenantBrand>
    if (typeof value.tenantId !== "string" || value.tenantId !== defaultBrand.tenantId) return defaultBrand
    return { ...defaultBrand, ...value }
  } catch {
    return defaultBrand
  }
}

function isTenantHostAllowed(host: string | undefined) {
  if (host === "osgardnewworld.com" || host === "www.osgardnewworld.com") return true
  // This opt-in exists solely for the isolated local CI contract.
  // Production does not set the flag and remains fail-closed by hostname.
  return process.env.OSGARD_E2E_LOCAL_TENANT === "true" && (host === "localhost" || host === "127.0.0.1")
}

function requestHost(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  return (forwardedHost || request.headers.get("host"))?.split(":")[0]?.toLowerCase()
}

function tenantUnavailable() {
  return NextResponse.json({ error: "Tenant недоступен для этого домена" }, { status: 404 })
}

export async function GET(request: NextRequest) {
  if (!isTenantHostAllowed(requestHost(request))) return tenantUnavailable()

  let brand = readServerBrand()
  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "")
  const token = request.cookies.get("osgard_access")?.value
  const authorization = request.headers.get("authorization") || (token ? `Bearer ${token}` : null)

  if (backendUrl && authorization?.startsWith("Bearer ")) {
    try {
      const upstream = await fetch(`${backendUrl}/design/tenant/brand`, { headers: { authorization }, cache: "no-store" })
      if (upstream.ok) {
        const payload = await upstream.json() as { brand?: Partial<TenantBrand> | null }
        if (payload.brand?.name && payload.brand?.accent && payload.brand?.displayFont) {
          brand = { tenantId: payload.brand.tenantId || defaultBrand.tenantId, name: payload.brand.name, accent: payload.brand.accent, displayFont: payload.brand.displayFont }
        }
      }
    } catch {
      // Public tenant defaults remain available during backend maintenance.
    }
  }

  return NextResponse.json({ version: "1.0.0", brand }, {
    headers: { "cache-control": "private, max-age=60, stale-while-revalidate=300", vary: "Host, Cookie" },
  })
}

export async function PUT(request: NextRequest) {
  if (!isTenantHostAllowed(requestHost(request))) return tenantUnavailable()

  const token = request.cookies.get("osgard_access")?.value
  const authorization = request.headers.get("authorization") || (token ? `Bearer ${token}` : null)
  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "")
  if (!backendUrl || !authorization?.startsWith("Bearer ")) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const upstream = await fetch(`${backendUrl}/design/tenant/brand`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  return NextResponse.json(await upstream.json().catch(() => ({ error: "Backend недоступен" })), { status: upstream.status })
}
