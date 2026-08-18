import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import db from "../lib/db"
import { FREE_REFINEMENTS_GRANT, refinementsRemaining, usedFreeRefinements } from "../lib/refinements"

beforeEach(() => {
  db.exec(`
    DROP TABLE IF EXISTS project_refinements;
    CREATE TABLE project_refinements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      cost_credits INTEGER NOT NULL DEFAULT 0
    );
  `)
})

test("failed refinements do not consume the free grant", () => {
  const insert = db.prepare(
    `INSERT INTO project_refinements (user_id, status, cost_credits) VALUES (?, ?, ?)`,
  )
  insert.run(7, "failed", 0)
  insert.run(7, "failed", 0)
  insert.run(7, "ready", 0)
  insert.run(7, "generating", 0)
  insert.run(7, "ready", 20)
  insert.run(8, "ready", 0)

  assert.equal(usedFreeRefinements(7), 2)
  assert.equal(refinementsRemaining(7), FREE_REFINEMENTS_GRANT - 2)
})
