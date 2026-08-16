import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import test from "node:test"
import db from "../lib/db"

test("refinement kind migration upgrades legacy rows and is idempotent", async () => {
  db.exec(`
    DROP TABLE IF EXISTS project_refinements;
    CREATE TABLE project_refinements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL
    );
    INSERT INTO project_refinements (prompt) VALUES ('legacy refinement');
  `)

  const migration = await import("../migrations/103_refinement_kind")
  migration.runRefinementKindMigration()

  const columns = db.prepare(`PRAGMA table_info(project_refinements)`).all() as Array<{ name: string }>
  const row = db.prepare(`SELECT kind FROM project_refinements`).get() as { kind: string }
  assert.equal(columns.filter((column) => column.name === "kind").length, 1)
  assert.equal(row.kind, "custom")
})
