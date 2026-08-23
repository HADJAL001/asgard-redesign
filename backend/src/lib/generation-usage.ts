import db from "./db"
import { captureError } from "./sentry"
import type { GenerationDepth } from "./generation-depths"
import type { TelemetrySnapshot } from "./generation-telemetry"

export type GenerationUsageKind = "generation" | "refinement" | "repair"
export type GenerationUsageStatus = "completed" | "failed"

function serializeMeter(snapshot: TelemetrySnapshot): string {
  return JSON.stringify({
    byProvider: snapshot.byProvider,
    aiMs: snapshot.aiMs,
    unmeasured: snapshot.unmeasured,
    failedCalls: snapshot.failed,
    tokenLimit: snapshot.tokenLimit ?? null,
    tokensRemaining: snapshot.tokensRemaining ?? null,
  })
}

export function beginGenerationUsageRun(params: {
  projectId: number
  userId: number
  kind: GenerationUsageKind
  depth: GenerationDepth
}): number | null {
  try {
    const attempt = (
      db.prepare(
        `SELECT COUNT(*) + 1 AS value
           FROM generation_usage_runs
          WHERE project_id = ? AND kind = ?`,
      ).get(params.projectId, params.kind) as { value: number }
    ).value
    const result = db.prepare(
      `INSERT INTO generation_usage_runs
         (project_id, user_id, kind, depth, attempt, started_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(params.projectId, params.userId, params.kind, params.depth, attempt, Date.now())
    return Number(result.lastInsertRowid)
  } catch (error) {
    captureError("[generation-usage] could not start usage run:", error)
    return null
  }
}

export function updateGenerationUsageRun(runId: number | null, snapshot: TelemetrySnapshot): void {
  if (runId === null) return
  try {
    db.prepare(
      `UPDATE generation_usage_runs
          SET ai_calls = ?, tokens_in = ?, tokens_out = ?, duration_ms = ?, meter = ?
        WHERE id = ?`,
    ).run(
      snapshot.calls,
      snapshot.inputTokens,
      snapshot.outputTokens,
      snapshot.elapsedMs,
      serializeMeter(snapshot),
      runId,
    )
  } catch (error) {
    captureError("[generation-usage] could not persist usage snapshot:", error)
  }
}

export function finishGenerationUsageRun(
  runId: number | null,
  status: GenerationUsageStatus,
  snapshot: TelemetrySnapshot | null,
): void {
  if (runId === null) return
  try {
    if (snapshot) updateGenerationUsageRun(runId, snapshot)
    db.prepare(
      `UPDATE generation_usage_runs SET status = ?, finished_at = ? WHERE id = ?`,
    ).run(status, Date.now(), runId)
  } catch (error) {
    captureError("[generation-usage] could not finish usage run:", error)
  }
}

export function getGenerationUsageReport() {
  const empty = {
    runs: 0,
    completed: 0,
    failed: 0,
    running: 0,
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    totalTokens: 0,
    durationMs: 0,
    unmeasuredCalls: 0,
    byProvider: {} as Record<string, { calls: number; tokens: number }>,
    byKind: {} as Record<string, { runs: number; tokens: number }>,
  }

  try {
    const totals = db.prepare(
      `SELECT COUNT(*) AS runs,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
              COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
              COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0) AS running,
              COALESCE(SUM(ai_calls), 0) AS calls,
              COALESCE(SUM(tokens_in), 0) AS tokensIn,
              COALESCE(SUM(tokens_out), 0) AS tokensOut,
              COALESCE(SUM(duration_ms), 0) AS durationMs,
              COALESCE(SUM(CASE WHEN json_valid(meter)
                THEN COALESCE(json_extract(meter, '$.unmeasured'), 0) ELSE 0 END), 0) AS unmeasuredCalls
         FROM generation_usage_runs`,
    ).get() as Omit<typeof empty, "totalTokens" | "byProvider" | "byKind">

    const byKindRows = db.prepare(
      `SELECT kind, COUNT(*) AS runs, COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens
         FROM generation_usage_runs
        GROUP BY kind`,
    ).all() as Array<{ kind: string; runs: number; tokens: number }>
    const byProviderRows = db.prepare(
      `SELECT provider.key AS provider,
              COALESCE(SUM(json_extract(provider.value, '$.calls')), 0) AS calls,
              COALESCE(SUM(json_extract(provider.value, '$.tokens')), 0) AS tokens
         FROM generation_usage_runs,
              json_each(CASE WHEN json_valid(meter) THEN meter ELSE '{}' END, '$.byProvider') AS provider
        GROUP BY provider.key`,
    ).all() as Array<{ provider: string; calls: number; tokens: number }>

    const report = {
      ...totals,
      totalTokens: totals.tokensIn + totals.tokensOut,
      byProvider: {} as Record<string, { calls: number; tokens: number }>,
      byKind: {} as Record<string, { runs: number; tokens: number }>,
    }
    for (const row of byKindRows) report.byKind[row.kind] = { runs: row.runs, tokens: row.tokens }
    for (const row of byProviderRows) report.byProvider[row.provider] = { calls: row.calls, tokens: row.tokens }
    return report
  } catch {
    // Deploys that have not run migration 104 yet report an empty, honest baseline.
    return empty
  }
}
