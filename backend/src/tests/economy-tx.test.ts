// ПЕРВОЙ строкой: форсирует DB_PATH=:memory: до загрузки lib/db (импорты
// исполняются по порядку). Иначе под общим `npm test` db-синглтон открыл бы
// боевую ./data/osgard.db с FK idempotency_keys→users. См. helpers/use-memory-db.
import "./helpers/use-memory-db"
import { test } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · economy-tx — атомарность + идемпотентность денежных
   операций. Проверяем на реальной (in-memory) SQLite, что:
     • исключение внутри mutate() откатывает ВСЁ (нет частичного
       состояния «деньги ушли, товара нет»);
     • при исключении идемпотентный ключ НЕ пишется (честный повтор
       после пополнения может пройти);
     • повтор с тем же ключом возвращает сохранённый ответ и НЕ
       списывает деньги повторно (replayed=true);
     • без ключа операция атомарна, но каждый вызов исполняется;
     • normalizeIdemKey нормализует/отбраковывает вход.

   Изоляция БД: helpers/use-memory-db (импорт первой строкой) форсирует
   DB_PATH=:memory: до загрузки lib/db — db-синглтон поднимается на
   изолированной in-memory БД независимо от способа запуска (`npm test`
   или точечный прогон), не трогая рабочий файл ./data/osgard.db.
   ================================================================ */

import { runEconomyOp, EconomyError, normalizeIdemKey } from "../lib/economy-tx"
import db from "../lib/db"

// Минимальная схема под тесты: idempotency_keys (как в миграции 085) + wallets.
db.exec(`
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
  CREATE TABLE IF NOT EXISTS wallets (user_id INTEGER PRIMARY KEY, timecoin INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS listings (id INTEGER PRIMARY KEY, status TEXT NOT NULL DEFAULT 'active');
  CREATE TABLE IF NOT EXISTS reward_users (id INTEGER PRIMARY KEY, claimed INTEGER NOT NULL DEFAULT 0);
`)

function resetWallet(userId: number, balance: number) {
  db.prepare(`INSERT INTO wallets (user_id, timecoin) VALUES (?, ?)
              ON CONFLICT(user_id) DO UPDATE SET timecoin = excluded.timecoin`).run(userId, balance)
  db.prepare(`DELETE FROM idempotency_keys WHERE user_id = ?`).run(userId)
}

function balance(userId: number): number {
  return (db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(userId) as any).timecoin
}

function idemCount(userId: number): number {
  return (db.prepare(`SELECT COUNT(*) c FROM idempotency_keys WHERE user_id = ?`).get(userId) as any).c
}

test("normalizeIdemKey: тримминг, пустое/длинное → null", () => {
  assert.equal(normalizeIdemKey("  abc "), "abc")
  assert.equal(normalizeIdemKey(""), null)
  assert.equal(normalizeIdemKey("   "), null)
  assert.equal(normalizeIdemKey(undefined), null)
  assert.equal(normalizeIdemKey(123 as unknown), null)
  assert.equal(normalizeIdemKey("x".repeat(201)), null)
  assert.equal(normalizeIdemKey("x".repeat(200))?.length, 200)
})

test("атомарность: исключение в mutate откатывает списание целиком", () => {
  const uid = 1
  resetWallet(uid, 100)
  assert.throws(() => {
    runEconomyOp({
      userId: uid,
      scope: "test",
      idemKey: "k1",
      mutate: () => {
        db.prepare(`UPDATE wallets SET timecoin = timecoin - 30 WHERE user_id = ?`).run(uid)
        throw new Error("boom после списания")
      },
    })
  })
  assert.equal(balance(uid), 100, "баланс должен откатиться до 100")
  assert.equal(idemCount(uid), 0, "идемпотентный ключ НЕ должен записаться при откате")
})

test("идемпотентность: повтор с тем же ключом не списывает дважды", () => {
  const uid = 2
  resetWallet(uid, 100)
  const op = () =>
    runEconomyOp({
      userId: uid,
      scope: "forge",
      idemKey: "same-key",
      mutate: () => {
        db.prepare(`UPDATE wallets SET timecoin = timecoin - 25 WHERE user_id = ?`).run(uid)
        return { charged: 25, balance: balance(uid) }
      },
    })

  const first = op()
  assert.equal(first.replayed, false)
  assert.equal(first.result.charged, 25)
  assert.equal(balance(uid), 75)

  const second = op()
  assert.equal(second.replayed, true, "второй вызов — повтор")
  assert.deepEqual(second.result, first.result, "тот же сохранённый ответ")
  assert.equal(balance(uid), 75, "второй раз деньги НЕ списаны")
  assert.equal(idemCount(uid), 1, "ровно один идемпотентный ключ")
})

test("без ключа: атомарно, но каждый вызов исполняется", () => {
  const uid = 3
  resetWallet(uid, 100)
  const op = () =>
    runEconomyOp({
      userId: uid,
      scope: "forge",
      idemKey: null,
      mutate: () => {
        db.prepare(`UPDATE wallets SET timecoin = timecoin - 10 WHERE user_id = ?`).run(uid)
        return { ok: true }
      },
    })
  assert.equal(op().replayed, false)
  assert.equal(op().replayed, false)
  assert.equal(balance(uid), 80, "оба вызова списали (идемпотентность выключена)")
  assert.equal(idemCount(uid), 0, "без ключа строки идемпотентности не создаются")
})

test("TOCTOU-захват лота: параллельный двойной buy списывает ровно один раз", () => {
  /* Моделируем узкое место marketplace /:id/buy: авторитетный перевод лота
     active→sold условным UPDATE ... WHERE status='active' (changes!==1 → 409)
     ДО списания. Два «одновременных» покупателя гонятся за одним лотом —
     захватить и списать должен ровно один; второй откатывается целиком. */
  const seller = 10
  const listingId = 777
  db.prepare(`INSERT INTO listings (id, status) VALUES (?, 'active')
              ON CONFLICT(id) DO UPDATE SET status='active'`).run(listingId)
  resetWallet(20, 100) // покупатель A
  resetWallet(21, 100) // покупатель B
  resetWallet(seller, 0)

  const buy = (buyerId: number) =>
    runEconomyOp({
      userId: buyerId,
      scope: "market_buy",
      idemKey: null,
      mutate: () => {
        const claim = db
          .prepare(`UPDATE listings SET status='sold' WHERE id=? AND status='active'`)
          .run(listingId)
        if (claim.changes !== 1) throw new EconomyError("Лот уже продан", 409)
        db.prepare(`UPDATE wallets SET timecoin = timecoin - 40 WHERE user_id = ?`).run(buyerId)
        db.prepare(`UPDATE wallets SET timecoin = timecoin + 40 WHERE user_id = ?`).run(seller)
        return { ok: true, buyer: buyerId }
      },
    })

  const first = buy(20)
  assert.equal(first.result.buyer, 20)
  // Второй покупатель приходит на уже проданный лот — 409, его баланс не тронут.
  assert.throws(() => buy(21), (e: unknown) => e instanceof EconomyError && (e as EconomyError).status === 409)

  assert.equal(balance(20), 60, "покупатель A списан один раз")
  assert.equal(balance(21), 100, "покупатель B не списан (откат)")
  assert.equal(balance(seller), 40, "продавец получил ровно за одну продажу")
})

test("double-claim награды: условный UPDATE флага начисляет ровно один раз", () => {
  /* Модель onboarding /economy-map-reward: авторитетный «захват» награды —
     перевод флага 0→1 условным UPDATE ... WHERE claimed=0 (changes!==1 → уже
     получено) ДО начисления. Два параллельных клика → начисление ровно раз. */
  const uid = 30
  db.prepare(`INSERT INTO reward_users (id, claimed) VALUES (?, 0)
              ON CONFLICT(id) DO UPDATE SET claimed=0`).run(uid)
  resetWallet(uid, 0)

  const claimReward = () =>
    runEconomyOp({
      userId: uid,
      scope: "reward",
      idemKey: null,
      mutate: () => {
        const claim = db.prepare(`UPDATE reward_users SET claimed=1 WHERE id=? AND claimed=0`).run(uid)
        if (claim.changes !== 1) throw new EconomyError("Уже получено", 400)
        db.prepare(`UPDATE wallets SET timecoin = timecoin + 50 WHERE user_id = ?`).run(uid)
        return { ok: true }
      },
    })

  assert.equal(claimReward().result.ok, true)
  assert.throws(claimReward, (e: unknown) => e instanceof EconomyError && (e as EconomyError).status === 400)
  assert.equal(balance(uid), 50, "награда начислена ровно один раз")
})

test("EconomyError пробрасывается, ключ не пишется → честный повтор возможен", () => {
  const uid = 4
  resetWallet(uid, 5)
  const attempt = () =>
    runEconomyOp({
      userId: uid,
      scope: "forge",
      idemKey: "retry-key",
      mutate: () => {
        const bal = balance(uid)
        if (bal < 30) throw new EconomyError("Недостаточно средств", 400)
        db.prepare(`UPDATE wallets SET timecoin = timecoin - 30 WHERE user_id = ?`).run(uid)
        return { charged: 30 }
      },
    })

  assert.throws(attempt, (e: unknown) => e instanceof EconomyError && (e as EconomyError).status === 400)
  assert.equal(idemCount(uid), 0, "отклонённая операция не занимает ключ")

  // Пополнили — тот же ключ теперь должен пройти (ключ не «сгорел» на отказе).
  db.prepare(`UPDATE wallets SET timecoin = 100 WHERE user_id = ?`).run(uid)
  const ok = attempt()
  assert.equal(ok.replayed, false)
  assert.equal(ok.result.charged, 30)
  assert.equal(balance(uid), 70)
})
