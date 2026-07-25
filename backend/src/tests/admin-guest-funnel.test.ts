import { test, before, beforeEach } from "node:test"
import assert from "node:assert/strict"

/* ================================================================
   OSGARD · Тесты ридера воронки «1 бесплатный проект по IP»
   (AdminController.guestFunnel). Read-only верх конверсионной воронки:
   гость (users.is_guest=1) → первый проект (активация) → claim (claimed_at).
   Проверяем:
     • пустая система — все нули, без деления на ноль;
     • подсчёт ступеней created/withProject/claimed/claimedWithProject;
     • ступенчатые ставки (activation/claim/projectToClaim);
     • окно `days` (мина: created_at TEXT ↔ unix-мс → normalizedTs);
     • реальные аккаунты (is_guest=0) в когорту НЕ попадают.
   In-memory БД; DB_PATH=:memory: до импорта lib/db.
   ================================================================ */

const DAY_MS = 86400000

let db: any
let AdminController: typeof import("../controllers/admin.controller").AdminController

before(async () => {
  process.env.DB_PATH = ":memory:"
  ;({ default: db } = await import("../lib/db"))
  // created_at без аффинити — хранит и unix-мс, и TEXT-дату (как прод).
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
  `)
  ;({ AdminController } = await import("../controllers/admin.controller"))
})

beforeEach(() => {
  db.exec("DELETE FROM users; DELETE FROM projects;")
})

// Возвращает id созданного пользователя (гостя по умолчанию).
function makeUser(opts: {
  isGuest?: number
  claimedAt?: number | null
  createdAt?: number | string // мс ИЛИ TEXT-дата
} = {}): number {
  const info = db
    .prepare(`INSERT INTO users (is_guest, claimed_at, created_at) VALUES (?, ?, ?)`)
    .run(opts.isGuest ?? 1, opts.claimedAt ?? null, opts.createdAt ?? Date.now() - DAY_MS)
  return Number(info.lastInsertRowid)
}

function makeProject(userId: number) {
  db.prepare(`INSERT INTO projects (user_id, created_at) VALUES (?, ?)`).run(userId, Date.now() - DAY_MS)
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

async function guestFunnel(days?: number) {
  const req: any = { query: days != null ? { days: String(days) } : {} }
  const res = mockRes()
  await AdminController.guestFunnel(req, res)
  return res
}

test("guest-funnel: пустая система — все нули, без деления на ноль", async () => {
  const res = await guestFunnel(30)
  assert.equal(res.statusCode, 200)
  const g = res.body.guestFunnel
  assert.equal(g.created, 0)
  assert.equal(g.withProject, 0)
  assert.equal(g.claimed, 0)
  assert.equal(g.claimedWithProject, 0)
  assert.equal(g.activationRate, 0, "нет деления на ноль при 0 гостей")
  assert.equal(g.claimRate, 0)
  assert.equal(g.projectToClaimRate, 0, "нет деления на ноль при 0 проектов")
})

test("guest-funnel: ступени created/withProject/claimed + ставки", async () => {
  // Гость 1: с проектом, забран (здоровая конверсия).
  const g1 = makeUser({ claimedAt: Date.now() - DAY_MS })
  makeProject(g1)
  // Гость 2: с проектом, НЕ забран.
  const g2 = makeUser({})
  makeProject(g2)
  // Гость 3: без проекта, НЕ забран (провижинился, но так ничего и не создал).
  makeUser({})
  // Гость 4: забран, но БЕЗ проекта (пустой claim — считаем в claimed, но не в claimedWithProject).
  makeUser({ claimedAt: Date.now() - DAY_MS })

  const g = (await guestFunnel(30)).body.guestFunnel
  assert.equal(g.created, 4)
  assert.equal(g.withProject, 2)
  assert.equal(g.claimed, 2)
  assert.equal(g.claimedWithProject, 1)
  assert.equal(g.activationRate, 2 / 4)
  assert.equal(g.claimRate, 2 / 4)
  assert.equal(g.projectToClaimRate, 1 / 2, "из 2 гостей с проектом забран 1")
})

test("guest-funnel: реальные аккаунты (is_guest=0) в когорту не попадают", async () => {
  makeUser({ isGuest: 0, claimedAt: null }) // обычный пользователь
  const real = makeUser({ isGuest: 0 })
  makeProject(real)
  makeUser({}) // единственный настоящий гость
  const g = (await guestFunnel(30)).body.guestFunnel
  assert.equal(g.created, 1, "считаем только is_guest=1")
  assert.equal(g.withProject, 0)
})

test("guest-funnel: окно days фильтрует по created_at (мс И TEXT-дата)", async () => {
  // В окне (мс).
  makeUser({ createdAt: Date.now() - 2 * DAY_MS })
  // В окне, но created_at хранится как TEXT-дата (прод-мина) — normalizedTs обязан привести.
  const iso = new Date(Date.now() - 3 * DAY_MS).toISOString().replace("T", " ").slice(0, 19)
  makeUser({ createdAt: iso })
  // За окном (40 дней назад при days=7).
  makeUser({ createdAt: Date.now() - 40 * DAY_MS })

  const g = (await guestFunnel(7)).body.guestFunnel
  assert.equal(g.created, 2, "оба формата created_at в окне 7д учтены, старый — отсечён")
})

test("guest-funnel: days клампится в [1, 365]", async () => {
  // Отрицательное — truthy для `|| 30`, затем Math.max(1,…) даёт нижний флор 1.
  assert.equal((await guestFunnel(-5)).body.guestFunnel.days, 1)
  assert.equal((await guestFunnel(9999)).body.guestFunnel.days, 365)
  // 0 и отсутствие → falsy для `|| 30` → дефолт 30 (как у всех ридеров).
  assert.equal((await guestFunnel(0)).body.guestFunnel.days, 30)
  assert.equal((await guestFunnel()).body.guestFunnel.days, 30, "дефолт 30")
})
