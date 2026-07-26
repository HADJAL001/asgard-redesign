import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты жатвы брошенных гостей воронки «1 бесплатный проект».
   reapStaleGuests/countStaleGuests (lib/guest-service). Жнём ТОЛЬКО:
     • is_guest=1 (реальные аккаунты неприкосновенны),
     • claimed_at IS NULL (забранного гостя не трогаем),
     • без проекта (проект = реальная работа, может быть забран позже),
     • старше TTL и вне окна переиспользования (24ч).
   Мины: created_at TEXT ↔ unix-мс (normalizedTs); самозащищённый DELETE.
   In-memory БД; DB_PATH=:memory: до импорта lib/db.
   ================================================================ */

const DAY_MS = 86400000

let db: any
let svc: typeof import("../lib/guest-service")

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_guest INTEGER NOT NULL DEFAULT 0,
      guest_ip TEXT,
      claimed_at INTEGER,
      created_at
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS wallets (
      user_id INTEGER PRIMARY KEY,
      credits INTEGER DEFAULT 0
    );
  `)
  svc = await import("../lib/guest-service")
})

beforeEach(() => {
  db.exec("DELETE FROM users; DELETE FROM projects; DELETE FROM wallets;")
})

// Возвращает id созданного пользователя (по умолчанию — старый брошенный гость).
function makeUser(
  opts: { isGuest?: number; claimedAt?: number | null; createdAt?: number | string; wallet?: boolean } = {},
): number {
  const info = db
    .prepare(`INSERT INTO users (is_guest, claimed_at, created_at) VALUES (?, ?, ?)`)
    .run(opts.isGuest ?? 1, opts.claimedAt ?? null, opts.createdAt ?? Date.now() - 30 * DAY_MS)
  const id = Number(info.lastInsertRowid)
  if (opts.wallet !== false) db.prepare(`INSERT INTO wallets (user_id) VALUES (?)`).run(id)
  return id
}

function makeProject(userId: number) {
  db.prepare(`INSERT INTO projects (user_id, created_at) VALUES (?, ?)`).run(userId, Date.now() - 30 * DAY_MS)
}

test("reaper: пустая система — ноль, без ошибок", () => {
  const r = svc.reapStaleGuests()
  assert.deepEqual(r, { scanned: 0, deletedGuests: 0, deletedWallets: 0 })
  assert.equal(svc.countStaleGuests(), 0)
})

test("reaper: жнёт брошенного гостя + его кошелёк", () => {
  makeUser({}) // старый гость, без проекта, не забран → мусор
  assert.equal(svc.countStaleGuests(), 1, "dry-run видит кандидата")
  const r = svc.reapStaleGuests()
  assert.equal(r.scanned, 1)
  assert.equal(r.deletedGuests, 1)
  assert.equal(r.deletedWallets, 1, "кошелёк-заглушка удалён вместе с гостем")
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM users`).get().c, 0)
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM wallets`).get().c, 0)
})

test("reaper: НЕ трогает реальные аккаунты, забранных гостей и гостей с проектом", () => {
  makeUser({ isGuest: 0 }) // реальный аккаунт (даже старый и без проекта)
  makeUser({ claimedAt: Date.now() - 20 * DAY_MS }) // гость, но забран
  const withProj = makeUser({}) // гость с проектом
  makeProject(withProj)
  const trash = makeUser({}) // единственный настоящий мусор

  assert.equal(svc.countStaleGuests(), 1, "кандидат только один")
  const r = svc.reapStaleGuests()
  assert.equal(r.deletedGuests, 1)
  // Остались: реальный, забранный, с проектом.
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM users`).get().c, 3)
  assert.equal(db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(trash), undefined)
  assert.ok(db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(withProj), "гость с проектом жив")
})

test("reaper: свежий гость в окне переиспользования не жнётся даже при малом ttl", () => {
  makeUser({ createdAt: Date.now() - 2 * 3600 * 1000 }) // 2 часа назад
  // Даже ttl=0 не должен опустить cutoff ниже окна переиспользования (24ч).
  assert.equal(svc.countStaleGuests(Date.now(), 0), 0)
  const r = svc.reapStaleGuests(Date.now(), 0)
  assert.equal(r.deletedGuests, 0, "гость младше 24ч неприкосновенен")
})

test("reaper: TTL — гость на границе (created_at TEXT-дата, прод-мина)", () => {
  // 10 дней назад как TEXT (нормализация обязана привести к мс).
  const iso = new Date(Date.now() - 10 * DAY_MS).toISOString().replace("T", " ").slice(0, 19)
  makeUser({ createdAt: iso })
  // ttl=7д → 10-дневный за порогом → жнётся.
  assert.equal(svc.countStaleGuests(Date.now(), 7 * DAY_MS), 1)
  // ttl=14д → 10-дневный ещё свеж → не жнётся.
  assert.equal(svc.countStaleGuests(Date.now(), 14 * DAY_MS), 0)
})

test("reaper: батч из нескольких — все брошенные удалены за одну транзакцию", () => {
  for (let i = 0; i < 5; i++) makeUser({})
  const keep = makeUser({ claimedAt: Date.now() }) // забранный — остаётся
  const r = svc.reapStaleGuests()
  assert.equal(r.scanned, 5)
  assert.equal(r.deletedGuests, 5)
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM users`).get().c, 1)
  assert.ok(db.prepare(`SELECT 1 FROM users WHERE id = ?`).get(keep))
})
