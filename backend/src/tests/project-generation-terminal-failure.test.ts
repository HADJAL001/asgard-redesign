import { before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"

let db: any
let reportTerminalGenerationFailure: typeof import("../lib/project-generation").reportTerminalGenerationFailure

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT,
      display_name TEXT,
      avatar_url TEXT
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL
    );
  `)
  const { runNotificationsMigration } = await import("../migrations/063_notifications_table")
  runNotificationsMigration()
  await import("../migrations/099_generation_makegood")
  ;({ reportTerminalGenerationFailure } = await import("../lib/project-generation"))
})

beforeEach(() => {
  db.exec("DELETE FROM notifications; DELETE FROM generation_makegoods; DELETE FROM projects; DELETE FROM users;")
  db.prepare(`INSERT INTO users (id, username, display_name) VALUES (1, 'tester', 'Tester')`).run()
  db.prepare(`INSERT INTO projects (id, user_id, name) VALUES (10, 1, 'Durable app')`).run()
})

test("после последнего падения durable-очереди платформа компенсирует исходную глубину", () => {
  const job = {
    project_id: 10,
    user_id: 1,
    payload: JSON.stringify({ depth: "deep" }),
  }

  reportTerminalGenerationFailure(job, "provider unavailable")
  reportTerminalGenerationFailure(job, "provider unavailable")

  const rights = db
    .prepare(`SELECT depth, credits, reason FROM generation_makegoods WHERE project_id = 10`)
    .all() as Array<{ depth: string; credits: number; reason: string }>
  assert.deepEqual(rights, [{ depth: "deep", credits: 50, reason: "crashed" }])

  const notification = db
    .prepare(`SELECT text FROM notifications WHERE user_id = 1 ORDER BY id ASC LIMIT 1`)
    .get() as { text: string }
  assert.match(notification.text, /за счёт платформы/)
})
