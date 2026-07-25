import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты воронки «1 бесплатный проект по IP» (guest-service).
   ----------------------------------------------------------------
   Чистая БД-логика lib/guest-service.ts против in-memory БД. Проверяем:
     • миграцию 087 (аддитивна + идемпотентна на тестовой схеме);
     • provisionGuest (is_guest=1, guest_ip, непроходной хеш, кошелёк);
     • findActiveGuestByIp (свежий / привязанный / протухший / чужой IP);
     • claimGuest (перенос проектов+артефактов, одноразовость, гварды).
   DB_PATH=:memory: до импорта lib/db. Схема users создаётся БЕЗ колонок
   миграции — их добавляет сама миграция 087 (так тестируем её на проде-подобии).
   ================================================================ */

const DAY_MS = 86400000

let db: any
let svc: typeof import("../lib/guest-service")
let runGuestAccountsMigration: () => void

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))

  // users — БЕЗ is_guest/guest_ip/claimed_at (их добавит миграция 087).
  // created_at с дефолтом «сейчас в мс» — как на проде (иначе окно свежести не работает).
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT,
      password_hash TEXT,
      username TEXT UNIQUE,
      phone TEXT,
      ip_address TEXT,
      referral_code TEXT,
      referred_by INTEGER,
      is_verified INTEGER NOT NULL DEFAULT 0,
      twofa_secret TEXT,
      twofa_enabled INTEGER NOT NULL DEFAULT 0,
      nonce INTEGER NOT NULL DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );
    CREATE TABLE IF NOT EXISTS wallets (
      user_id INTEGER PRIMARY KEY,
      credits INTEGER NOT NULL DEFAULT 0,
      shards INTEGER NOT NULL DEFAULT 0,
      crystals INTEGER NOT NULL DEFAULT 0,
      timecoin INTEGER NOT NULL DEFAULT 0,
      cash_usd INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')*1000)
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      status TEXT DEFAULT 'kept'
    );
  `)

  // Импорт миграции self-invoke'ит её на нашей in-memory схеме (добавит колонки+индекс).
  ;({ runGuestAccountsMigration } = await import("../migrations/087_guest_accounts"))
  svc = await import("../lib/guest-service")
})

beforeEach(() => {
  db.exec("DELETE FROM users; DELETE FROM wallets; DELETE FROM projects; DELETE FROM artifacts;")
})

/* Хелпер: реальный (не гость) аккаунт. */
function realUser(username = "real_" + Math.random().toString(36).slice(2, 8)): number {
  const info = db
    .prepare(`INSERT INTO users (username, password_hash, role) VALUES (?, 'hash', 'user')`)
    .run(username)
  return info.lastInsertRowid as number
}

/* ---------------- Миграция 087 ---------------- */

test("миграция 087: добавила колонки is_guest/guest_ip/claimed_at", () => {
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)
  assert.ok(cols.includes("is_guest"), "is_guest")
  assert.ok(cols.includes("guest_ip"), "guest_ip")
  assert.ok(cols.includes("claimed_at"), "claimed_at")
})

test("миграция 087: идемпотентна (повторный вызов не падает)", () => {
  assert.doesNotThrow(() => runGuestAccountsMigration())
  assert.doesNotThrow(() => runGuestAccountsMigration())
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)
  // Колонки не задублировались
  assert.equal(cols.filter((c) => c === "is_guest").length, 1)
})

/* ---------------- provisionGuest ---------------- */

test("provisionGuest: создаёт гостя is_guest=1 с guest_ip и непроходным хешем", () => {
  const g = svc.provisionGuest("1.2.3.4")
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(g.id) as any
  assert.equal(row.is_guest, 1)
  assert.equal(row.guest_ip, "1.2.3.4")
  assert.equal(row.claimed_at, null)
  assert.equal(row.password_hash, "!guest", "пароль-сентинел — вход по паролю невозможен")
  assert.match(row.username, /^guest_/)
})

test("provisionGuest: заводит кошелёк-заглушку (0 кредитов)", () => {
  const g = svc.provisionGuest("1.2.3.4")
  const w = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(g.id) as any
  assert.ok(w, "кошелёк создан")
  assert.equal(w.credits, 0)
})

/* ---------------- findActiveGuestByIp ---------------- */

test("findActiveGuestByIp: находит свежего непривязанного гостя", () => {
  const g = svc.provisionGuest("9.9.9.9")
  const found = svc.findActiveGuestByIp("9.9.9.9")
  assert.equal(found?.id, g.id)
})

test("findActiveGuestByIp: не возвращает чужой IP", () => {
  svc.provisionGuest("9.9.9.9")
  assert.equal(svc.findActiveGuestByIp("8.8.8.8"), undefined)
})

test("findActiveGuestByIp: исключает уже привязанного (claimed_at)", () => {
  const g = svc.provisionGuest("9.9.9.9")
  db.prepare(`UPDATE users SET claimed_at = ? WHERE id = ?`).run(Date.now(), g.id)
  assert.equal(svc.findActiveGuestByIp("9.9.9.9"), undefined)
})

test("findActiveGuestByIp: исключает протухшего (старше окна)", () => {
  const g = svc.provisionGuest("9.9.9.9")
  db.prepare(`UPDATE users SET created_at = ? WHERE id = ?`).run(Date.now() - DAY_MS - 60000, g.id)
  assert.equal(svc.findActiveGuestByIp("9.9.9.9"), undefined)
})

/* ---------------- claimGuest ---------------- */

test("claimGuest: переносит проекты и артефакты, ставит claimed_at", () => {
  const guest = svc.provisionGuest("1.1.1.1")
  const real = realUser()
  db.prepare(`INSERT INTO projects (user_id) VALUES (?)`).run(guest.id)
  db.prepare(`INSERT INTO projects (user_id) VALUES (?)`).run(guest.id)
  db.prepare(`INSERT INTO artifacts (owner_id) VALUES (?)`).run(guest.id)

  const res = svc.claimGuest(real, guest.id)
  assert.equal(res.ok, true)
  if (res.ok) {
    assert.equal(res.projectsMoved, 2)
    assert.equal(res.artifactsMoved, 1)
  }
  // Проекты теперь у реального аккаунта, у гостя — пусто
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM projects WHERE user_id = ?`).get(real) as any).c, 2)
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM projects WHERE user_id = ?`).get(guest.id) as any).c, 0)
  // claimed_at проставлен
  const row = db.prepare(`SELECT claimed_at FROM users WHERE id = ?`).get(guest.id) as any
  assert.notEqual(row.claimed_at, null)
})

test("claimGuest: SELF_CLAIM — нельзя забрать самого себя", () => {
  const g = svc.provisionGuest("1.1.1.1")
  const res = svc.claimGuest(g.id, g.id)
  assert.equal(res.ok, false)
  if (!res.ok) {
    assert.equal(res.code, "SELF_CLAIM")
    assert.equal(res.status, 400)
  }
})

test("claimGuest: GUEST_NOT_FOUND для несуществующего", () => {
  const real = realUser()
  const res = svc.claimGuest(real, 999999)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.code, "GUEST_NOT_FOUND")
})

test("claimGuest: GUEST_NOT_FOUND если цель — реальный аккаунт (не гость)", () => {
  const real = realUser()
  const otherReal = realUser()
  const res = svc.claimGuest(real, otherReal)
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.code, "GUEST_NOT_FOUND")
})

test("claimGuest: ALREADY_CLAIMED при повторном claim — двойного переноса нет", () => {
  const guest = svc.provisionGuest("1.1.1.1")
  const real1 = realUser()
  const real2 = realUser()
  db.prepare(`INSERT INTO projects (user_id) VALUES (?)`).run(guest.id)

  const first = svc.claimGuest(real1, guest.id)
  assert.equal(first.ok, true)

  const second = svc.claimGuest(real2, guest.id)
  assert.equal(second.ok, false)
  if (!second.ok) {
    assert.equal(second.code, "ALREADY_CLAIMED")
    assert.equal(second.status, 409)
  }
  // Проект остался у первого забравшего, второму ничего не ушло
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM projects WHERE user_id = ?`).get(real1) as any).c, 1)
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM projects WHERE user_id = ?`).get(real2) as any).c, 0)
})
