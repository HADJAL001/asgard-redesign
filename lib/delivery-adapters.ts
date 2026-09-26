type IntegrationRecord = { id: number; status?: string; lastTestStatus?: string | null }

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

export type DeliveryAdapterCheck = { ready: boolean; label: string }

/** Reads only the authenticated user's adapter metadata; credentials stay in Service Bridge. */
export async function verifyDeliveryAdapters(ids: number[], access: string | undefined): Promise<DeliveryAdapterCheck> {
  if (!ids.length) return { ready: true, label: "No infrastructure adapters selected" }
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
    const selected = ids.map((id) => records.find((item) => item.id === id))
    const ready = selected.length === ids.length && selected.every((item) => item?.status === "active" && item.lastTestStatus === "passed")
    return { ready, label: ready ? `${ids.length} infrastructure adapter(s) verified` : "Selected adapters must be active and pass their latest test" }
  } catch {
    return { ready: false, label: "Could not read selected infrastructure adapters" }
  }
}
