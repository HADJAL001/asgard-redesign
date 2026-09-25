import type { NextRequest } from "next/server"

export const DEFAULT_TENANT_ID = "osgardnewworld"

/** Tenant identity is bound to the allowed production host, never to user input. */
export function tenantIdFromRequest(request: NextRequest) {
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim().split(":")[0].toLowerCase()
  if (host === "www.osgardnewworld.com" || host === "osgardnewworld.com" || host === "localhost" || host === "127.0.0.1") return DEFAULT_TENANT_ID
  return null
}
