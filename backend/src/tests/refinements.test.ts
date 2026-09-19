import "./helpers/use-memory-db"
import assert from "node:assert/strict"
import { beforeEach, test } from "node:test"
import db from "../lib/db"
import {
  FREE_REFINEMENTS_GRANT,
  failRefinementWithRefund,
  refinementsRemaining,
  usedFreeRefinements,
} from "../lib/refinements"

beforeEach(() => {
  db.exec(`
    DROP TABLE IF EXISTS project_refinements;
    DROP TABLE IF EXISTS wallets;
    DROP TABLE IF EXISTS audit_log;
    DROP TABLE IF EXISTS promo_credit_charges;
    DROP TABLE IF EXISTS promo_credit_grants;
    CREATE TABLE project_refinements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER,
      status TEXT NOT NULL,
      cost_credits INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE wallets (
      user_id INTEGER PRIMARY KEY,
      credits REAL NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE promo_credit_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      remaining REAL NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE promo_credit_charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      grant_id INTEGER NOT NULL,
      refinement_id INTEGER,
      amount REAL NOT NULL,
      refunded_at INTEGER
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

test("paid failed refinement is refunded exactly once", () => {
  db.prepare(`INSERT INTO wallets (user_id, credits, updated_at) VALUES (7, 80, 1)`).run()
  const id = Number(
    db
      .prepare(
        `INSERT INTO project_refinements (user_id, project_id, status, cost_credits)
         VALUES (7, 42, 'generating', 20)`,
      )
      .run().lastInsertRowid,
  )

  assert.deepEqual(failRefinementWithRefund(id), { userId: 7, projectId: 42, refundedCredits: 20 })
  assert.equal((db.prepare(`SELECT credits FROM wallets WHERE user_id = 7`).get() as { credits: number }).credits, 100)
  assert.equal((db.prepare(`SELECT status FROM project_refinements WHERE id = ?`).get(id) as { status: string }).status, "failed")
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS count FROM audit_log WHERE reason = 'project_refinement_refund'`).get() as { count: number }).count,
    1,
  )

  assert.equal(failRefinementWithRefund(id), null)
  assert.equal((db.prepare(`SELECT credits FROM wallets WHERE user_id = 7`).get() as { credits: number }).credits, 100)
  assert.equal(
    (db.prepare(`SELECT COUNT(*) AS count FROM audit_log WHERE reason = 'project_refinement_refund'`).get() as { count: number }).count,
    1,
  )
})

test("refund helper participates in an existing durable-worker transaction", () => {
  db.prepare(`INSERT INTO wallets (user_id, credits, updated_at) VALUES (9, 0, 1)`).run()
  const id = Number(
    db
      .prepare(
        `INSERT INTO project_refinements (user_id, project_id, status, cost_credits)
         VALUES (9, 77, 'generating', 20)`,
      )
      .run().lastInsertRowid,
  )

  db.exec("BEGIN IMMEDIATE")
  try {
    assert.equal(failRefinementWithRefund(id)?.refundedCredits, 20)
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }

  assert.equal((db.prepare(`SELECT credits FROM wallets WHERE user_id = 9`).get() as { credits: number }).credits, 20)
})

test("failed paid refinement restores its promo allocation without minting wallet credits", () => {
  db.prepare(`INSERT INTO wallets (user_id, credits, updated_at) VALUES (12, 7, 1)`).run()
  const grantId = Number(
    db.prepare(`INSERT INTO promo_credit_grants (user_id, amount, remaining, expires_at) VALUES (12, 20, 0, ?)`).run(Date.now() + 60_000).lastInsertRowid,
  )
  const refinementId = Number(
    db.prepare(`INSERT INTO project_refinements (user_id, project_id, status, cost_credits) VALUES (12, 11, 'generating', 20)`).run().lastInsertRowid,
  )
  db.prepare(`INSERT INTO promo_credit_charges (grant_id, refinement_id, amount) VALUES (?, ?, 20)`).run(grantId, refinementId)

  assert.deepEqual(failRefinementWithRefund(refinementId), { userId: 12, projectId: 11, refundedCredits: 20 })
  assert.equal((db.prepare(`SELECT credits FROM wallets WHERE user_id = 12`).get() as { credits: number }).credits, 7)
  assert.equal((db.prepare(`SELECT remaining FROM promo_credit_grants WHERE id = ?`).get(grantId) as { remaining: number }).remaining, 20)
  assert.ok((db.prepare(`SELECT refunded_at FROM promo_credit_charges WHERE refinement_id = ?`).get(refinementId) as { refunded_at: number }).refunded_at)
  assert.equal(failRefinementWithRefund(refinementId), null)
  assert.equal((db.prepare(`SELECT remaining FROM promo_credit_grants WHERE id = ?`).get(grantId) as { remaining: number }).remaining, 20)
})

test("failed mixed payment restores only the ordinary portion to wallet", () => {
  db.prepare(`INSERT INTO wallets (user_id, credits, updated_at) VALUES (13, 5, 1)`).run()
  const grantId = Number(
    db.prepare(`INSERT INTO promo_credit_grants (user_id, amount, remaining, expires_at) VALUES (13, 15, 0, ?)`).run(Date.now() + 60_000).lastInsertRowid,
  )
  const refinementId = Number(
    db.prepare(`INSERT INTO project_refinements (user_id, project_id, status, cost_credits) VALUES (13, 12, 'generating', 20)`).run().lastInsertRowid,
  )
  db.prepare(`INSERT INTO promo_credit_charges (grant_id, refinement_id, amount) VALUES (?, ?, 15)`).run(grantId, refinementId)

  failRefinementWithRefund(refinementId)
  assert.equal((db.prepare(`SELECT credits FROM wallets WHERE user_id = 13`).get() as { credits: number }).credits, 10)
  assert.equal((db.prepare(`SELECT remaining FROM promo_credit_grants WHERE id = ?`).get(grantId) as { remaining: number }).remaining, 15)
})
