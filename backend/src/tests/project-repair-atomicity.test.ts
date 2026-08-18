import { before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"

let db: any
let commitAcceptedRepairFiles: typeof import("../lib/project-generation").commitAcceptedRepairFiles

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  db.exec(`
    CREATE TABLE project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_id, path)
    );
  `)
  ;({ commitAcceptedRepairFiles } = await import("../lib/project-generation"))
})

beforeEach(() => {
  db.exec("DELETE FROM project_files")
  db.prepare(`INSERT INTO project_files (project_id, path, content, updated_at) VALUES (10, 'app/page.tsx', 'working', 1)`).run()
  db.prepare(`INSERT INTO project_files (project_id, path, content, updated_at) VALUES (10, 'old.ts', 'keep until accepted', 1)`).run()
})

function storedFiles(): Array<{ path: string; content: string }> {
  return db.prepare(`SELECT path, content FROM project_files WHERE project_id = 10 ORDER BY path`).all()
}

test("rejected repair leaves the last usable project byte-for-byte intact", () => {
  const previous = storedFiles()
  const accepted = commitAcceptedRepairFiles(10, previous, [{ path: "app/page.tsx", content: "broken candidate" }], false)
  assert.equal(accepted, false)
  assert.deepEqual(storedFiles(), previous)
})

test("accepted repair replaces and removes files in one promotion", () => {
  const previous = storedFiles()
  const accepted = commitAcceptedRepairFiles(10, previous, [
    { path: "app/page.tsx", content: "verified candidate" },
    { path: "new.ts", content: "new file" },
  ], true)
  assert.equal(accepted, true)
  assert.deepEqual(storedFiles(), [
    { path: "app/page.tsx", content: "verified candidate" },
    { path: "new.ts", content: "new file" },
  ])
})
