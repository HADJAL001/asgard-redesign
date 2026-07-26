// ПЕРВОЙ строкой: форсирует DB_PATH=:memory: до загрузки lib/db (импорты
// исполняются по порядку) — db-синглтон поднимается на изолированной in-memory
// БД, не трогая рабочий ./data/osgard.db. См. helpers/use-memory-db.
import "./helpers/use-memory-db"
import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты экономики доработок (lib/refinements + миграция 089).
   ----------------------------------------------------------------
   Метеринг «итеративной правки» против реальной in-memory SQLite:
     • миграция 089 (аддитивна + идемпотентна на тестовой схеме);
     • getRefinementsRemaining — чистое чтение: null у гостя/несуществующего,
       ленивый FREE у реального с NULL-колонкой, В БД НЕ ПИШЕТ;
     • consumeRefinement — грант → декремент; исчерпание → кредиты (402 без
       баланса); гость → 403; идемпотентность по Idempotency-Key (replay);
     • refundRefinement — возврат гранта/кредитов + удаление строки, идемпотентно.
   Схема users создаётся БЕЗ refinements_remaining — колонку добавляет сама
   миграция 089 (тестируем её на прод-подобии).
   ================================================================ */

let db: any
let refinements: typeof import("../lib/refinements")
let runProjectRefinementsMigration: () => void

before(async () => {
  ;({ default: db } = await import("../lib/db"))

  // Минимальная прод-подобная схема. users — БЕЗ refinements_remaining (её
  // добавит миграция 089). idempotency_keys — как в миграции 085 (нужна runEconomyOp).
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password_hash TEXT,
      is_guest INTEGER NOT NULL DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );
    CREATE TABLE IF NOT EXISTS wallets (
      user_id INTEGER PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0,
      shards INTEGER NOT NULL DEFAULT 0,
      crystals INTEGER NOT NULL DEFAULT 0,
      timecoin INTEGER NOT NULL DEFAULT 0,
      cash_usd INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      item TEXT,
      counterparty TEXT,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'done',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reason TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      scope TEXT NOT NULL,
      idem_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      response_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idem_unique ON idempotency_keys(user_id, scope, idem_key);
  `)

  // Импорт миграции self-invoke'ит её на нашей схеме (добавит колонку users.refinements_remaining
  // + таблицу project_refinements + индексы).
  ;({ runProjectRefinementsMigration } = await import("../migrations/089_project_refinements"))
  refinements = await import("../lib/refinements")
})

beforeEach(() => {
  db.exec(
    "DELETE FROM users; DELETE FROM wallets; DELETE FROM projects; DELETE FROM transactions; DELETE FROM audit_log; DELETE FROM project_refinements; DELETE FROM idempotency_keys;",
  )
})

/* Хелперы. */
function makeUser(opts: { guest?: boolean; credits?: number } = {}): number {
  const info = db
    .prepare(`INSERT INTO users (username, password_hash, is_guest) VALUES (?, 'hash', ?)`)
    .run("u_" + Math.random().toString(36).slice(2, 9), opts.guest ? 1 : 0)
  const uid = info.lastInsertRowid as number
  db.prepare(`INSERT INTO wallets (user_id, credits) VALUES (?, ?)`).run(uid, opts.credits ?? 0)
  return uid
}

function makeProject(userId: number): number {
  return db.prepare(`INSERT INTO projects (user_id) VALUES (?)`).run(userId).lastInsertRowid as number
}

function refinementsCol(userId: number): number | null {
  return (db.prepare(`SELECT refinements_remaining FROM users WHERE id = ?`).get(userId) as any).refinements_remaining
}

function credits(userId: number): number {
  return (db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(userId) as any).credits
}

function ledgerCount(userId: number): number {
  return (db.prepare(`SELECT COUNT(*) c FROM project_refinements WHERE user_id = ?`).get(userId) as any).c
}

/* ---------------- Миграция 089 ---------------- */

test("миграция 089: добавила users.refinements_remaining и таблицу project_refinements", () => {
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)
  assert.ok(cols.includes("refinements_remaining"), "колонка refinements_remaining")
  const tbl = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='project_refinements'`)
    .get()
  assert.ok(tbl, "таблица project_refinements")
})

test("миграция 089: идемпотентна (повторный вызов не падает, колонка не дублируется)", () => {
  assert.doesNotThrow(() => runProjectRefinementsMigration())
  assert.doesNotThrow(() => runProjectRefinementsMigration())
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)
  assert.equal(cols.filter((c) => c === "refinements_remaining").length, 1)
})

/* ---------------- getRefinementsRemaining (чистое чтение) ---------------- */

test("getRefinementsRemaining: несуществующий пользователь → null", () => {
  assert.equal(refinements.getRefinementsRemaining(987654), null)
})

test("getRefinementsRemaining: гость → null (стена регистрации)", () => {
  const g = makeUser({ guest: true })
  assert.equal(refinements.getRefinementsRemaining(g), null)
})

test("getRefinementsRemaining: реальный аккаунт с NULL-колонкой → FREE, В БД НЕ ПИШЕТ", () => {
  const u = makeUser()
  assert.equal(refinementsCol(u), null, "предусловие: колонка NULL")
  assert.equal(refinements.getRefinementsRemaining(u), refinements.FREE_REFINEMENTS_ON_SIGNUP)
  // Чистое чтение: колонка осталась NULL (ленивая материализация не сработала при чтении).
  assert.equal(refinementsCol(u), null, "чтение не материализовало грант в БД")
})

test("getRefinementsRemaining: явный 0 в колонке → 0 (не путать с NULL)", () => {
  const u = makeUser()
  db.prepare(`UPDATE users SET refinements_remaining = 0 WHERE id = ?`).run(u)
  assert.equal(refinements.getRefinementsRemaining(u), 0)
})

/* ---------------- consumeRefinement: грант ---------------- */

test("consumeRefinement: первая трата реального аккаунта оплачена грантом (NULL → FREE-1)", () => {
  const u = makeUser()
  const p = makeProject(u)
  const charge = refinements.consumeRefinement({ userId: u, projectId: p, hint: "добавь тёмную тему" })
  assert.equal(charge.paidWith, "grant")
  assert.equal(charge.creditsCost, 0)
  assert.equal(charge.replayed, false)
  assert.equal(charge.remaining, refinements.FREE_REFINEMENTS_ON_SIGNUP - 1)
  assert.equal(refinementsCol(u), refinements.FREE_REFINEMENTS_ON_SIGNUP - 1, "грант материализован декрементом")
  assert.equal(ledgerCount(u), 1, "одна строка в леджере")
})

test("consumeRefinement: грант тратится до нуля, затем переключается на кредиты", () => {
  const u = makeUser({ credits: 100 })
  const p = makeProject(u)
  // FREE бесплатных доработок — все грантом.
  for (let i = 0; i < refinements.FREE_REFINEMENTS_ON_SIGNUP; i++) {
    const c = refinements.consumeRefinement({ userId: u, projectId: p })
    assert.equal(c.paidWith, "grant", `трата #${i + 1} — грант`)
  }
  assert.equal(refinementsCol(u), 0, "грант исчерпан")
  // Следующая — за кредиты.
  const paid = refinements.consumeRefinement({ userId: u, projectId: p })
  assert.equal(paid.paidWith, "credits")
  assert.equal(paid.creditsCost, refinements.REFINEMENT_CREDIT_COST)
  assert.equal(credits(u), 100 - refinements.REFINEMENT_CREDIT_COST, "кредиты списаны")
  assert.equal(paid.remaining, 0)
})

/* ---------------- consumeRefinement: кредиты и отказ ---------------- */

test("consumeRefinement: без гранта и без достаточных кредитов → EconomyError 402", () => {
  const u = makeUser({ credits: 5 })
  db.prepare(`UPDATE users SET refinements_remaining = 0 WHERE id = ?`).run(u) // грант исчерпан
  const p = makeProject(u)
  assert.throws(
    () => refinements.consumeRefinement({ userId: u, projectId: p }),
    (e: any) => e.status === 402 && e.payload?.code === "INSUFFICIENT_CREDITS",
  )
  // Ничего не списано, леджер пуст.
  assert.equal(credits(u), 5)
  assert.equal(ledgerCount(u), 0)
})

test("consumeRefinement: гость → EconomyError 403 (стена регистрации)", () => {
  const g = makeUser({ guest: true, credits: 999 })
  const p = makeProject(g)
  assert.throws(
    () => refinements.consumeRefinement({ userId: g, projectId: p }),
    (e: any) => e.status === 403 && e.payload?.code === "GUEST_REFINEMENT_WALL",
  )
  assert.equal(ledgerCount(g), 0)
})

test("consumeRefinement: несуществующий пользователь → EconomyError 404", () => {
  assert.throws(
    () => refinements.consumeRefinement({ userId: 987654, projectId: 1 }),
    (e: any) => e.status === 404 && e.payload?.code === "USER_NOT_FOUND",
  )
})

/* ---------------- Идемпотентность ---------------- */

test("consumeRefinement: повтор с тем же Idempotency-Key не тратит дважды (replayed)", () => {
  const u = makeUser()
  const p = makeProject(u)
  const first = refinements.consumeRefinement({ userId: u, projectId: p, idemKey: "dbl-click" })
  assert.equal(first.replayed, false)
  assert.equal(first.paidWith, "grant")
  const remAfterFirst = refinementsCol(u)

  const second = refinements.consumeRefinement({ userId: u, projectId: p, idemKey: "dbl-click" })
  assert.equal(second.replayed, true, "второй вызов — повтор")
  assert.equal(second.refinementId, first.refinementId, "тот же refinementId")
  assert.equal(refinementsCol(u), remAfterFirst, "грант не тронут повторно")
  assert.equal(ledgerCount(u), 1, "ровно одна строка леджера")
})

/* ---------------- refundRefinement ---------------- */

test("refundRefinement: возврат грантовой доработки восстанавливает остаток и удаляет строку", () => {
  const u = makeUser()
  const p = makeProject(u)
  const charge = refinements.consumeRefinement({ userId: u, projectId: p })
  assert.equal(refinementsCol(u), refinements.FREE_REFINEMENTS_ON_SIGNUP - 1)

  refinements.refundRefinement(charge.refinementId)
  assert.equal(refinementsCol(u), refinements.FREE_REFINEMENTS_ON_SIGNUP, "грант возвращён")
  assert.equal(ledgerCount(u), 0, "строка леджера удалена")
})

test("refundRefinement: возврат кредитной доработки возвращает кредиты + компенсирующая транзакция", () => {
  const u = makeUser({ credits: 100 })
  db.prepare(`UPDATE users SET refinements_remaining = 0 WHERE id = ?`).run(u)
  const p = makeProject(u)
  const charge = refinements.consumeRefinement({ userId: u, projectId: p })
  assert.equal(charge.paidWith, "credits")
  assert.equal(credits(u), 100 - refinements.REFINEMENT_CREDIT_COST)

  refinements.refundRefinement(charge.refinementId)
  assert.equal(credits(u), 100, "кредиты возвращены полностью")
  const refundTx = db
    .prepare(`SELECT COUNT(*) c FROM transactions WHERE user_id = ? AND type = 'project_refinement_refund'`)
    .get(u) as any
  assert.equal(refundTx.c, 1, "компенсирующая транзакция записана")
  assert.equal(ledgerCount(u), 0)
})

test("refundRefinement: идемпотентен — повтор по уже удалённой строке no-op", () => {
  const u = makeUser()
  const p = makeProject(u)
  const charge = refinements.consumeRefinement({ userId: u, projectId: p })
  refinements.refundRefinement(charge.refinementId)
  const remAfter = refinementsCol(u)
  // Повторный возврат ничего не меняет (строки уже нет).
  assert.doesNotThrow(() => refinements.refundRefinement(charge.refinementId))
  assert.equal(refinementsCol(u), remAfter, "второй возврат не начислил грант повторно")
})
