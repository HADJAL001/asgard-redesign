import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

const DAY_MS = 86_400_000
let db: any
let AdminController: typeof import("../controllers/admin.controller").AdminController

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT NOT NULL,
      event_name TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    )
  `)
  ;({ AdminController } = await import("../controllers/admin.controller"))
})

beforeEach(() => db.exec("DELETE FROM analytics_events"))

function insert(createdAt: number, meta: unknown, eventName = "web_vital") {
  db.prepare(
    "INSERT INTO analytics_events (user_id, session_id, event_name, meta, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(null, "test-session", eventName, typeof meta === "string" ? meta : JSON.stringify(meta), createdAt)
}

function response() {
  const result: any = { statusCode: 200, body: null }
  result.status = (code: number) => { result.statusCode = code; return result }
  result.json = (body: unknown) => { result.body = body; return result }
  return result
}

test("web vitals aggregates p75 and ignores malformed or unknown samples", async () => {
  const now = Date.now()
  insert(now - 1_000, { name: "LCP", value: 1000 })
  insert(now - 900, { name: "LCP", value: 2000 })
  insert(now - 800, { name: "LCP", value: 3000 })
  insert(now - 700, { name: "CLS", value: 0.04 })
  insert(now - 600, { name: "INP", value: "120" })
  insert(now - 500, "not-json")
  insert(now - 400, { name: "custom", value: 1 })

  const res = response()
  await AdminController.webVitals({ query: { days: "30" } } as any, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.totalSamples, 5)
  assert.deepEqual(res.body.metrics.LCP, { count: 3, p75: 3000 })
  assert.deepEqual(res.body.metrics.CLS, { count: 1, p75: 0.04 })
  assert.deepEqual(res.body.metrics.INP, { count: 1, p75: 120 })
  assert.deepEqual(res.body.metrics.FCP, { count: 0, p75: null })
})

test("web vitals clamps the window and excludes stale events", async () => {
  const now = Date.now()
  insert(now - DAY_MS, { name: "TTFB", value: 80 })
  insert(now - 91 * DAY_MS, { name: "TTFB", value: 10 })
  insert(now - 100, { name: "LCP", value: -1 })

  const res = response()
  await AdminController.webVitals({ query: { days: "999" } } as any, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res.body.days, 90)
  assert.deepEqual(res.body.metrics.TTFB, { count: 1, p75: 80 })
  assert.deepEqual(res.body.metrics.LCP, { count: 0, p75: null })
})
