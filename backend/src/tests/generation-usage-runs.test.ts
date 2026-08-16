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
