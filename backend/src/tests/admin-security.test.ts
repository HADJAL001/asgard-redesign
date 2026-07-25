import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты ридера картины безопасности (AdminController.security).
   Read-only постура аккаунтов (2FA/баны/админы/новые/активные) + аудит
   активности администраторов поверх admin_logs. Отдельно проверяем ДВЕ мины
   единиц времени этой БД:
     • users.created_at может быть TEXT (DATETIME) на проде → normalizedTs к мс;
     • users.last_login — unixepoch() = СЕКУНДЫ → порог сравнения в секундах.
   In-memory БД; DB_PATH=:memory: до импорта lib/db.
   ================================================================ */

const DAY_MS = 86400000
const DAY_SEC = 86400

let db: any
let AdminController: typeof import("../controllers/admin.controller").AdminController

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  // users.created_at намеренно объявлен без типа-принуждения (в SQLite колонка
  // с аффинити BLOB/NUMERIC хранит и число, и TEXT) — чтобы проверить оба формата,
  // как на реальном проде. last_login — INTEGER секунды.
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      twofa_enabled INTEGER NOT NULL DEFAULT 0,
      banned INTEGER NOT NULL DEFAULT 0,
      role TEXT DEFAULT 'user',
      created_at,            -- без аффинити: хранит и unix-мс, и TEXT-дату (как прод)
      last_login INTEGER     -- unixepoch() = секунды
    );
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_user_id INTEGER,
      meta TEXT,
      ip TEXT,
      user_agent TEXT,
      status INTEGER,
      created_at INTEGER NOT NULL
    );
  `)
  ;({ AdminController } = await import("../controllers/admin.controller"))
})

beforeEach(() => {
  db.exec("DELETE FROM users; DELETE FROM admin_logs;")
})

function user(opts: {
  twofa?: number
  banned?: number
  role?: string
  createdAt?: number | string // мс ИЛИ TEXT-дата
  lastLoginSec?: number | null // СЕКУНДЫ
} = {}) {
  db.prepare(
    `INSERT INTO users (twofa_enabled, banned, role, created_at, last_login) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    opts.twofa ?? 0,
    opts.banned ?? 0,
    opts.role ?? "user",
    opts.createdAt ?? Date.now() - DAY_MS,
    opts.lastLoginSec ?? null,
  )
}

function adminLog(opts: {
  adminId?: number
  action?: string
  ip?: string | null
  status?: number | null
  createdAt?: number
} = {}) {
  db.prepare(
    `INSERT INTO admin_logs (admin_id, action, ip, status, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(
    opts.adminId ?? 1,
    opts.action ?? "GET admin/stats",
    opts.ip ?? null,
    opts.status ?? 200,
    opts.createdAt ?? Date.now() - DAY_MS,
  )
}

function mockRes() {
  const r: any = { statusCode: 200, body: null }
  r.status = (c: number) => {
    r.statusCode = c
    return r
  }
  r.json = (b: any) => {
    r.body = b
    return r
  }
  return r
}

async function security(days?: number) {
  const req: any = { query: days != null ? { days: String(days) } : {} }
  const res = mockRes()
  await AdminController.security(req, res)
  return res
}

test("security: пустая система — все нули, без деления на ноль", async () => {
  const res = await security(30)
  assert.equal(res.statusCode, 200)
  const s = res.body.security
  assert.equal(s.accounts.totalUsers, 0)
  assert.equal(s.accounts.twofaAdoptionRate, 0, "нет деления на ноль при 0 юзеров")
  assert.equal(s.accounts.newUsers, 0)
  assert.equal(s.accounts.activeUsers, 0)
  assert.equal(s.adminActivity.actions, 0)
  assert.deepEqual(s.suspects.topAdminActions, [])
  assert.deepEqual(s.suspects.topAdminIps, [])
})

test("security: постура аккаунтов — 2FA-adoption / баны / админы", async () => {
  user({ twofa: 1, role: "admin" })
  user({ twofa: 1 })
  user({ banned: 1 })
  user({}) // обычный без 2FA
  const s = (await security(30)).body.security.accounts
  assert.equal(s.totalUsers, 4)
  assert.equal(s.twofaEnabled, 2)
  assert.equal(s.twofaAdoptionRate, 0.5)
  assert.equal(s.bannedUsers, 1)
  assert.equal(s.admins, 1)
})

test("security: newUsers считает и unix-мс, И TEXT-дату (normalizedTs, прод-safe)", async () => {
  const nowMs = Date.now()
  user({ createdAt: nowMs - 2 * DAY_MS }) // мс, в окне
  user({ createdAt: "2000-01-01 00:00:00" }) // TEXT-дата вне окна (древняя)
  // TEXT-дата в окне: 12 часов назад в формате DATETIME (как CURRENT_TIMESTAMP на проде).
  const recentText = new Date(nowMs - DAY_MS / 2).toISOString().slice(0, 19).replace("T", " ")
  user({ createdAt: recentText })
  const s = (await security(30)).body.security.accounts
  assert.equal(s.totalUsers, 3)
  assert.equal(s.newUsers, 2, "мс-запись + TEXT-дата в окне; древняя TEXT-дата отсечена")
})

test("security: activeUsers сравнивает last_login в СЕКУНДАХ (unixepoch)", async () => {
  const nowSec = Math.floor(Date.now() / 1000)
  user({ lastLoginSec: nowSec - 2 * DAY_SEC }) // активен в окне
  user({ lastLoginSec: nowSec - 40 * DAY_SEC }) // старый вход вне окна
  user({ lastLoginSec: null }) // ни разу не входил
  const s = (await security(30)).body.security.accounts
  assert.equal(s.activeUsers, 1, "только вход 2 дня назад попадает в окно 30д")
})

test("security: активность админов — distinct/failed/mutating", async () => {
  adminLog({ adminId: 1, action: "GET admin/stats", ip: "1.1.1.1", status: 200 })
  adminLog({ adminId: 1, action: "GET admin/users", ip: "1.1.1.1", status: 200 })
  adminLog({ adminId: 2, action: "PATCH admin/users/:id/ban", ip: "2.2.2.2", status: 200 }) // мутация
  adminLog({ adminId: 2, action: "PATCH admin/users/:id/role", ip: "2.2.2.2", status: 403 }) // мутация + fail
  const a = (await security(30)).body.security.adminActivity
  assert.equal(a.actions, 4)
  assert.equal(a.distinctAdmins, 2)
  assert.equal(a.distinctIps, 2)
  assert.equal(a.failedActions, 1, "один ответ ≥400")
  assert.equal(a.mutatingActions, 2, "две не-GET (PATCH) операции")
})

test("security: distinctIps игнорирует NULL-ip", async () => {
  adminLog({ ip: "9.9.9.9" })
  adminLog({ ip: null })
  adminLog({ ip: null })
  const a = (await security(30)).body.security.adminActivity
  assert.equal(a.actions, 3)
  assert.equal(a.distinctIps, 1, "COUNT(DISTINCT ip) не считает NULL")
})

test("security: топы отсортированы по частоте и обрезаны; ip=NULL не в топе IP", async () => {
  adminLog({ action: "GET admin/stats", ip: "1.1.1.1" })
  adminLog({ action: "GET admin/stats", ip: "1.1.1.1" })
  adminLog({ action: "GET admin/users", ip: null })
  const s = (await security(30)).body.security.suspects
  assert.equal(s.topAdminActions[0].action, "GET admin/stats")
  assert.equal(s.topAdminActions[0].count, 2, "самое частое действие сверху")
  assert.equal(s.topAdminIps.length, 1, "только не-NULL ip попал в топ")
  assert.equal(s.topAdminIps[0].ip, "1.1.1.1")
  assert.equal(s.topAdminIps[0].count, 2)
})

test("security: окно days отсекает старые события по всем векторам", async () => {
  const nowMs = Date.now()
  const nowSec = Math.floor(nowMs / 1000)
  user({ createdAt: nowMs - 40 * DAY_MS, lastLoginSec: nowSec - 40 * DAY_SEC })
  adminLog({ createdAt: nowMs - 40 * DAY_MS })
  const s30 = (await security(30)).body.security
  assert.equal(s30.accounts.newUsers, 0, "старая регистрация вне окна")
  assert.equal(s30.accounts.activeUsers, 0, "старый вход вне окна")
  assert.equal(s30.adminActivity.actions, 0, "старый лог вне окна")
  const s365 = (await security(365)).body.security
  assert.equal(s365.accounts.newUsers, 1)
  assert.equal(s365.accounts.activeUsers, 1)
  assert.equal(s365.adminActivity.actions, 1)
})

test("security: days клампится в [1,365] (семантика как в growth/integrity)", async () => {
  assert.equal((await security(0)).body.security.days, 30, "0 → дефолт 30")
  assert.equal((await security(-5)).body.security.days, 1, "отрицательное → нижний клэмп 1")
  assert.equal((await security(9999)).body.security.days, 365, "9999 → верхний клэмп 365")
  assert.equal((await security()).body.security.days, 30, "по умолчанию 30")
})
