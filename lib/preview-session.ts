import type { BlueprintPreviewTelemetry, StoredBlueprint } from "./blueprint-store"

export type PreviewRuntimeStatus = "ready" | "building" | "failed" | "unavailable"

function safePreviewUrl(value: unknown) {
  if (typeof value !== "string") return undefined
  try {
    const url = new URL(value)
    // Generated output must never turn this first-party UI into a transport
    // for credential-bearing, local-network, or non-TLS preview URLs.
    if (url.protocol !== "https:" || url.username || url.password) return undefined
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "::1" || /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

export function buildPreviewSession(blueprint: StoredBlueprint, timing: BlueprintPreviewTelemetry) {
  const generation = blueprint.generation
  const previewUrl = safePreviewUrl(generation?.result?.previewUrl)
  const isVerifiedRuntimePreview = generation?.status === "completed" && Boolean(generation.artifactSeal) && Boolean(previewUrl)
  const runtime = isVerifiedRuntimePreview
    ? { status: "ready" as const, source: "signed-generation-artifact" as const, url: previewUrl }
    : generation?.status === "processing" || generation?.status === "queued"
      ? { status: "building" as const, source: "generation" as const, reason: "generation_in_progress" as const }
      : generation?.status === "failed" || generation?.status === "cancelled"
        ? { status: "failed" as const, source: "generation" as const, reason: "generation_failed" as const }
        : generation?.status === "completed"
          ? { status: "unavailable" as const, source: "generation" as const, reason: "signed_preview_url_required" as const }
          : { status: "unavailable" as const, source: "generation" as const, reason: "generation_not_started" as const }

  return {
    version: "1.1.0",
    id: timing.id,
    blueprintId: blueprint.id,
    revision: blueprint.revision,
    contractHash: blueprint.contractHash || "",
    contractPreview: { status: "ready" as const, source: "product-contract" as const },
    runtime,
    timing: {
      firstReadyAt: timing.firstReadyAt,
      firstReadyDurationMs: timing.firstReadyDurationMs,
      targetMs: 60_000,
      withinTarget: timing.firstReadyDurationMs <= 60_000,
    },
  }
}
