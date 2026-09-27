import type { NextRequest } from "next/server"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

export type BlueprintActor = { id?: string | number; username?: string; displayName?: string; email?: string }

export async function requireBlueprintActor(request: NextRequest): Promise<{ actor: BlueprintActor } | { error: "auth_required" | "backend_unavailable" }> {
  const access = request.cookies.get("osgard_access")?.value
  if (!access) return { error: "auth_required" }
  if (!BACKEND_URL) return { error: "backend_unavailable" }
  const response = await fetch(`${BACKEND_URL}/auth/me`, {
    headers: { authorization: `Bearer ${access}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null)
  if (!response) return { error: "backend_unavailable" }
  if (!response.ok) return { error: "auth_required" }
  const payload = await response.json().catch(() => null) as { user?: BlueprintActor } | null
  if (!payload?.user) return { error: "auth_required" }
  return { actor: payload.user }
}

export function blueprintActorName(actor: BlueprintActor) {
  return [actor.displayName, actor.username, actor.email].find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim().slice(0, 80) || "OSGARD collaborator"
}
