import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import test from "node:test"
import db from "../lib/db"
import type { TelemetrySnapshot } from "../lib/generation-telemetry"

function snapshot(tokensIn: number, tokensOut: number): TelemetrySnapshot {
  return {
    calls: 1,
    inputTokens: tokensIn,
    outputTokens: tokensOut,
    totalTokens: tokensIn + tokensOut,
    aiMs: 25,
    elapsedMs: 40,
    unmeasured: 0,
    failed: 0,
    byProvider: { deepseek: { calls: 1, tokens: tokensIn + tokensOut } },
  }
}

test("usage runs preserve completed and failed attempts separately", async () => {
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE projects (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    INSERT INTO projects (id) VALUES (10);
  `)
  await import("../migrations/104_generation_usage_runs")
  const {
    beginGenerationUsageRun,
    updateGenerationUsageRun,
    finishGenerationUsageRun,
    getGenerationUsageReport,
  } = await import("../lib/generation-usage")

  const failed = beginGenerationUsageRun({ projectId: 10, userId: 1, kind: "generation", depth: "deep" })
  updateGenerationUsageRun(failed, snapshot(800, 200))
  finishGenerationUsageRun(failed, "failed", snapshot(800, 200))

  const completed = beginGenerationUsageRun({ projectId: 10, userId: 1, kind: "generation", depth: "deep" })
  finishGenerationUsageRun(completed, "completed", snapshot(1600, 400))

  const rows = db.prepare(
    `SELECT attempt, status, tokens_in + tokens_out AS tokens
       FROM generation_usage_runs ORDER BY id`,
  ).all() as Array<{ attempt: number; status: string; tokens: number }>
  assert.deepEqual(rows, [
    { attempt: 1, status: "failed", tokens: 1000 },
    { attempt: 2, status: "completed", tokens: 2000 },
  ])

  const report = getGenerationUsageReport()
  assert.equal(report.runs, 2)
  assert.equal(report.failed, 1)
  assert.equal(report.completed, 1)
  assert.equal(report.totalTokens, 3000)
  assert.deepEqual(report.byProvider.deepseek, { calls: 2, tokens: 3000 })
})

test("startup recovery preserves fresh and actively leased usage runs", async () => {
  db.exec(`
    DROP TABLE IF EXISTS generation_usage_runs;
    DROP TABLE IF EXISTS project_generation_jobs;
    CREATE TABLE generation_usage_runs (
      id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
      kind TEXT NOT NULL, depth TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'running', ai_calls INTEGER NOT NULL DEFAULT 0,
      tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0, meter TEXT, started_at INTEGER NOT NULL, finished_at INTEGER
    );
    CREATE TABLE project_generation_jobs (
      project_id INTEGER PRIMARY KEY, status TEXT NOT NULL, lease_until INTEGER
    );
  `)
  const now = 2_000_000
  db.prepare(`INSERT INTO generation_usage_runs (id, project_id, user_id, kind, depth, started_at) VALUES (1, 11, 1, 'generation', 'standard', ?), (2, 12, 1, 'generation', 'standard', ?), (3, 13, 1, 'generation', 'standard', ?)`)
    .run(now - 1_000, now - 100_000, now - 100_000)
  db.prepare(`INSERT INTO project_generation_jobs (project_id, status, lease_until) VALUES (13, 'running', ?)`)
    .run(now + 10_000)
  const { recoverStaleGenerationUsageRuns } = await import("../migrations/104_generation_usage_runs")
  assert.equal(recoverStaleGenerationUsageRuns(now, 10_000), 1)
  const rows = db.prepare(`SELECT id, status FROM generation_usage_runs ORDER BY id`).all()
  assert.deepEqual(rows, [{ id: 1, status: "running" }, { id: 2, status: "failed" }, { id: 3, status: "running" }])
})
