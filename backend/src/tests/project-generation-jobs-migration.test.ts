import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import test from "node:test"
import db from "../lib/db"

test("generation queue migration upgrades the first durable schema in place", async () => {
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    CREATE TABLE projects (id INTEGER PRIMARY KEY);
    CREATE TABLE project_refinements (id INTEGER PRIMARY KEY);
    CREATE TABLE project_generation_jobs (
      project_id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      refinement_id INTEGER,
      status TEXT NOT NULL DEFAULT 'queued',
      attempts INTEGER NOT NULL DEFAULT 0,
      lease_until INTEGER,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (refinement_id) REFERENCES project_refinements(id) ON DELETE SET NULL
    );
    CREATE INDEX idx_project_generation_jobs_claim
      ON project_generation_jobs(status, lease_until, created_at);
  `)

  await import("../migrations/099_project_generation_jobs")

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(project_generation_jobs)`).all() as Array<{ name: string }>).map((column) => column.name),
  )
  assert.equal(columns.has("available_at"), true)
  assert.equal(columns.has("lease_token"), true)

  const indexColumns = (
    db.prepare(`PRAGMA index_info(idx_project_generation_jobs_claim)`).all() as Array<{ name: string }>
  ).map((column) => column.name)
  assert.deepEqual(indexColumns, ["status", "available_at", "lease_until", "created_at"])
})
