type IntegrationRecord = { id: number; connectorId?: string; status?: string; lastTestStatus?: string | null }

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")
const INFRASTRUCTURE_CONNECTORS = new Set(["cloudflare", "supabase-management", "hostinger", "contabo"])

export function validateDeliveryAdapterRecords(ids: number[], records: IntegrationRecord[], requiredConnectorIds: string[] = []): DeliveryAdapterCheck {
  if (!ids.length) return requiredConnectorIds.length
    ? { ready: false, label: `Select and test required adapter(s): ${requiredConnectorIds.join(", ")}` }
    : { ready: true, label: "No infrastructure adapters selected" }
  const uniqueIds = [...new Set(ids)]
  const selected = uniqueIds.map((id) => records.find((item) => item.id === id))
  const selectedConnectorIds = new Set(selected.flatMap((item) => item?.connectorId ? [item.connectorId] : []))
  const missingRequired = requiredConnectorIds.filter((connectorId) => !selectedConnectorIds.has(connectorId))
  const valid = selected.every((item) => item?.status === "active" && item.lastTestStatus === "passed")
    && (requiredConnectorIds.length > 0 || selected.every((item) => Boolean(item?.connectorId && INFRASTRUCTURE_CONNECTORS.has(item.connectorId))))
  const ready = valid && missingRequired.length === 0
  const label = missingRequired.length
    ? `Select and test required adapter(s): ${missingRequired.join(", ")}`
    : ready ? `${uniqueIds.length} selected adapter(s) passed verification` : "Selected adapters must be active and pass their latest test; infrastructure delivery requires its matching adapter"
  return { ready, label }
}

export type DeliveryAdapterCheck = { ready: boolean; label: string }

async function selectedIntegrationId(ids: number[], access: string, connectorId: string): Promise<number | null> {
  const response = await fetch(`${BACKEND_URL}/integrations`, {
    headers: { authorization: `Bearer ${access}` },
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  })
  if (!response.ok) return null
  const payload = await response.json().catch(() => null) as { integrations?: IntegrationRecord[] } | null
  return payload?.integrations?.find((item) => ids.includes(item.id) && item.connectorId === connectorId && item.status === "active")?.id ?? null
}

/** Confirms zone ownership and a configured DNS address record via Cloudflare's read-only adapter actions. */
export async function verifyDeliveryDomain(domain: string, ids: number[], access: string | undefined): Promise<DeliveryAdapterCheck> {
  if (!BACKEND_URL || !access) return { ready: false, label: "Cloudflare adapter session is unavailable" }
  try {
    const integrationId = await selectedIntegrationId(ids, access, "cloudflare")
    if (!integrationId) return { ready: false, label: "Select and test an active Cloudflare adapter to verify domain ownership and DNS records" }
    const response = await fetch(`${BACKEND_URL}/integrations/${integrationId}/verify-domain`, {
      method: "POST",
      headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
      body: JSON.stringify({ domain }),
      signal: AbortSignal.timeout(18_000),
      cache: "no-store",
    })
    const payload = await response.json().catch(() => null) as { verified?: boolean } | null
    return payload?.verified === true
      ? { ready: true, label: `Cloudflare zone and DNS address record verified for ${domain}` }
      : { ready: false, label: `Cloudflare could not verify zone ownership and a configured DNS address record for ${domain}` }
  } catch {
    return { ready: false, label: `Cloudflare domain verification failed for ${domain}` }
  }
}

/** Confirms the exact Supabase project is accessible with the selected management credential. */
export async function verifySupabaseProject(projectRef: string, ids: number[], access: string | undefined): Promise<DeliveryAdapterCheck> {
  if (!BACKEND_URL || !access) return { ready: false, label: "Supabase Management adapter session is unavailable" }
  try {
    const integrationId = await selectedIntegrationId(ids, access, "supabase-management")
    if (!integrationId) return { ready: false, label: "Select an active Supabase Management adapter with a passing credential test" }
    const response = await fetch(`${BACKEND_URL}/integrations/${integrationId}/verify-project`, {
      method: "POST",
      headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
      body: JSON.stringify({ projectRef }),
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
    const payload = await response.json().catch(() => null) as { verified?: boolean } | null
    return payload?.verified === true
      ? { ready: true, label: `Supabase Management confirmed access to project ${projectRef}` }
      : { ready: false, label: `Supabase Management could not confirm access to project ${projectRef}` }
  } catch {
    return { ready: false, label: `Supabase project verification failed for ${projectRef}` }
  }
}

/** Reads only the authenticated user's adapter metadata; credentials stay in Service Bridge. */
export async function verifyDeliveryAdapters(ids: number[], access: string | undefined, requiredConnectorIds: string[] = []): Promise<DeliveryAdapterCheck> {
  if (!ids.length) return validateDeliveryAdapterRecords(ids, [], requiredConnectorIds)
  if (!BACKEND_URL || !access) return { ready: false, label: "Infrastructure adapter session is unavailable" }
  try {
    const response = await fetch(`${BACKEND_URL}/integrations`, {
      headers: { authorization: `Bearer ${access}` },
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    })
    if (!response.ok) return { ready: false, label: "Could not read selected infrastructure adapters" }
    const payload = await response.json().catch(() => null) as { integrations?: IntegrationRecord[] } | null
    const records = Array.isArray(payload?.integrations) ? payload.integrations : []
    return validateDeliveryAdapterRecords(ids, records, requiredConnectorIds)
  } catch {
    return { ready: false, label: "Could not read selected infrastructure adapters" }
  }
}
