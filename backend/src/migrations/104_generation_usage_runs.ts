import db from "../lib/db"

db.exec(`
  CREATE TABLE IF NOT EXISTS generation_usage_runs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        INTEGER NOT NULL,
    user_id           INTEGER NOT NULL,
    kind              TEXT NOT NULL CHECK(kind IN ('generation', 'refinement', 'repair')),
    depth             TEXT NOT NULL CHECK(depth IN ('quick', 'standard', 'deep')),
    attempt           INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    ai_calls          INTEGER NOT NULL DEFAULT 0,
    tokens_in         INTEGER NOT NULL DEFAULT 0,
    tokens_out        INTEGER NOT NULL DEFAULT 0,
    duration_ms       INTEGER NOT NULL DEFAULT 0,
    meter             TEXT,
    started_at        INTEGER NOT NULL,
    finished_at       INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_generation_usage_project
    ON generation_usage_runs(project_id, kind, id);
  CREATE INDEX IF NOT EXISTS idx_generation_usage_started
    ON generation_usage_runs(started_at DESC);
`)

export const USAGE_RUN_STALE_MS = 15 * 60_000

/** Recover only abandoned attempts. A deploy may briefly run old and new
 * processes together, so startup must not fail a run whose durable job still
 * owns a live lease in another process. */
export function recoverStaleGenerationUsageRuns(
  now = Date.now(),
  staleMs = USAGE_RUN_STALE_MS,
): number {
  const hasJobsTable = !!db.prepare(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project_generation_jobs'`,
  ).get()
  const liveLeaseGuard = hasJobsTable
    ? `AND NOT EXISTS (
          SELECT 1
            FROM project_generation_jobs AS job
           WHERE job.project_id = generation_usage_runs.project_id
             AND job.status = 'running'
             AND COALESCE(job.lease_until, 0) > ?
        )`
    : ""
  const result = db.prepare(
    `UPDATE generation_usage_runs
        SET status = 'failed', finished_at = COALESCE(finished_at, ?)
      WHERE status = 'running'
        AND started_at <= ?
        ${liveLeaseGuard}`,
  ).run(...(hasJobsTable ? [now, now - Math.max(0, staleMs), now] : [now, now - Math.max(0, staleMs)]))
  return result.changes
}

recoverStaleGenerationUsageRuns()
