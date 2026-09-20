import { before, beforeEach, test } from "node:test"
import assert from "node:assert/strict"

let db: any
let AdminController: typeof import("../controllers/admin.controller").AdminController

function mockResponse() {
  const response: any = { statusCode: 200, body: null }
  response.status = (statusCode: number) => {
    response.statusCode = statusCode
    return response
  }
  response.json = (body: any) => {
    response.body = body
    return response
  }
  return response
}

function adminRequest(body: Record<string, unknown>, params: Record<string, string> = {}) {
  return {
    body,
    params,
    headers: {},
    user: { userId: 1, username: "admin", role: "admin" },
  } as any
}

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
    CREATE TABLE artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id INTEGER, name TEXT, type TEXT, rarity TEXT,
      level INTEGER, power INTEGER, defense INTEGER, magic INTEGER, speed INTEGER, status TEXT,
      views_24h INTEGER, supply INTEGER, price REAL, list_currency TEXT, is_test INTEGER,
      test_created_by INTEGER, created_at INTEGER
    );
    CREATE TABLE promo_credit_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, amount INTEGER, remaining INTEGER,
      reason TEXT, issued_by INTEGER, expires_at INTEGER, created_at INTEGER
    );
    CREATE TABLE admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id INTEGER, action TEXT, target_user_id INTEGER,
      meta TEXT, ip TEXT, user_agent TEXT, status INTEGER, created_at INTEGER
    );
  `)
  ;({ AdminController } = await import("../controllers/admin.controller"))
})

beforeEach(() => {
  db.exec("DELETE FROM users; DELETE FROM artifacts; DELETE FROM promo_credit_grants; DELETE FROM admin_logs;")
  db.prepare("INSERT INTO users (id, username) VALUES (1, 'admin'), (2, 'owner')").run()
})

test("admin test artifacts are visibly soulbound, audited, and capped at 50 per day", async () => {
  const first = mockResponse()
  await AdminController.createTestArtifact(adminRequest({ ownerId: 2, name: "Matrix" }), first)

  assert.equal(first.statusCode, 201)
  assert.equal(first.body.soulbound, true)
  assert.deepEqual(first.body.pool, { used: 1, limit: 50 })
  assert.deepEqual(
    db.prepare("SELECT name, is_test, status, test_created_by FROM artifacts").get(),
    { name: "[TEST] Matrix", is_test: 1, status: "kept", test_created_by: 1 },
  )
  assert.equal(db.prepare("SELECT action FROM admin_logs").get().action, "create_test_artifact")

  const now = Date.now()
  const insert = db.prepare("INSERT INTO artifacts (owner_id, name, type, rarity, status, is_test, test_created_by, created_at) VALUES (2, ?, 'matrix', 'common', 'kept', 1, 1, ?)")
  for (let index = 0; index < 49; index += 1) insert.run(`[TEST] Fixture ${index}`, now)

  const exhausted = mockResponse()
  await AdminController.createTestArtifact(adminRequest({ ownerId: 2, name: "Too many" }), exhausted)
  assert.equal(exhausted.statusCode, 429)
  assert.equal(exhausted.body.limit, 50)
})

test("promo credits are reasoned, audited, and expire seven days after issuance", async () => {
  const response = mockResponse()
  const beforeIssue = Date.now()
  await AdminController.grantPromoCredits(adminRequest({ amount: 500, reason: "Bug report #123" }, { id: "2" }), response)

  assert.equal(response.statusCode, 201)
  const grant = db.prepare("SELECT amount, remaining, reason, issued_by, expires_at FROM promo_credit_grants").get()
  assert.equal(grant.amount, 500)
  assert.equal(grant.remaining, 500)
  assert.equal(grant.reason, "Bug report #123")
  assert.equal(grant.issued_by, 1)
  assert.ok(grant.expires_at >= beforeIssue + 7 * 86_400_000)
  assert.ok(grant.expires_at <= Date.now() + 7 * 86_400_000 + 1_000)
  assert.equal(db.prepare("SELECT action FROM admin_logs").get().action, "grant_promo_credits")
})

test("promo credits may explicitly expire after thirty days", async () => {
  const response = mockResponse()
  const beforeIssue = Date.now()
  await AdminController.grantPromoCredits(adminRequest({ amount: 50, reason: "Event", expiresInDays: 30 }, { id: "2" }), response)

  assert.equal(response.statusCode, 201)
  const grant = db.prepare("SELECT expires_at FROM promo_credit_grants ORDER BY id DESC LIMIT 1").get() as { expires_at: number }
  assert.ok(grant.expires_at >= beforeIssue + 30 * 86_400_000)
  assert.ok(grant.expires_at <= Date.now() + 30 * 86_400_000 + 1_000)
})

test("promo grants cannot create an unbounded free AI budget", async () => {
  const response = mockResponse()
  await AdminController.grantPromoCredits(adminRequest({ amount: 501, reason: "Event" }, { id: "2" }), response)

  assert.equal(response.statusCode, 400)
  assert.equal(db.prepare("SELECT COUNT(*) as count FROM promo_credit_grants").get().count, 0)
})
