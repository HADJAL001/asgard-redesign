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

export function GET(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = (forwardedHost || request.headers.get("host"))?.split(":")[0]?.toLowerCase()
  if (host !== "osgardnewworld.com" && host !== "www.osgardnewworld.com") {
    return NextResponse.json({ error: "Tenant недоступен для этого домена" }, { status: 404 })
  }
  const brand = readServerBrand()
  return NextResponse.json({ version: "1.0.0", brand }, {
    headers: { "cache-control": "private, max-age=60, stale-while-revalidate=300", vary: "Host, Cookie" },
  })
}
