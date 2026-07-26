import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · Mentor sessions — «встреча с создателями» (founder_circle)
   ----------------------------------------------------------------
   Поднимает реальный backend отдельным процессом (миграции 083/086
   исполняются самовызовом при импорте server.ts), сеет
   academy_enrollments напрямую в БД (гейт по тиру — не его тестируем
   здесь), затем бьёт по /academy/mentor/request и /academy/mentor/my
   и проверяет: гейт founder_circle, ≤1 слот в period_ym (гонка на
   partial-unique индексе миграции 086 → 409 MENTOR_SLOT_TAKEN),
   освобождение месяца после cancel (нет HTTP-эндпоинта отмены —
   отменяем напрямую в БД, аналогично seedCertificate в
   certified-registry.test.ts). Паттерн — как в certified-registry.test.ts.
   ================================================================ */

const PORT = 4502
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-mentor-sessions.db"
const backendRoot = path.resolve(__dirname, "../..")
const dbAbsolutePath = path.resolve(backendRoot, DB_RELATIVE_PATH)
const tsxCliPath = require.resolve("tsx/cli")

let serverProcess: ChildProcess

async function cleanupDbFiles() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = dbAbsolutePath + suffix
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!fs.existsSync(p)) break
      try {
        fs.rmSync(p)
        break
      } catch (err) {
        if (attempt === 9) throw err
        await new Promise((r) => setTimeout(r, 200))
      }
    }
  }
}

async function waitForHealth(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`)
      if (res.ok) return
    } catch {
      /* ждём старта */
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("Тестовый сервер не поднялся вовремя")
}

function runInitDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [tsxCliPath, "src/scripts/init-db.ts"], {
      cwd: backendRoot,
      env: { ...process.env, DB_PATH: DB_RELATIVE_PATH, NODE_ENV: "test" },
      stdio: "ignore",
    })
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`init-db exit ${code}`))))
    p.on("error", reject)
  })
}

async function register(prefix: string): Promise<{ token: string; userId: number }> {
  const username = `${prefix}${Date.now() % 100_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "password123" }),
  })
  assert.equal(res.status, 201, "регистрация должна вернуть 201")
  const data = (await res.json()) as { token: string; user: { id: number } }
  return { token: data.token, userId: data.user.id }
}

/** Сеет активную запись в программу напрямую в БД (обходя Stripe checkout — не его тестируем здесь). */
function seedEnrollment(userId: number, tier: "founder_track" | "founder_circle", status = "active") {
  const seed = new Database(dbAbsolutePath)
  try {
    seed
      .prepare(
        `INSERT INTO academy_enrollments (user_id, tier, status, current_period_start, current_period_end, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET tier = excluded.tier, status = excluded.status`,
      )
      .run(userId, tier, status, Date.now(), Date.now() + 30 * 86_400_000, Date.now(), Date.now())
  } finally {
    seed.close()
  }
}

/** Отменяет mentor-сессию напрямую в БД — HTTP-эндпоинта отмены не существует. */
function cancelMentorSession(sessionId: number) {
  const seed = new Database(dbAbsolutePath)
  try {
    seed.prepare(`UPDATE mentor_sessions SET status = 'canceled' WHERE id = ?`).run(sessionId)
  } finally {
    seed.close()
  }
}

before(async () => {
  await cleanupDbFiles()
  await runInitDb()
  serverProcess = spawn(process.execPath, [tsxCliPath, "src/server.ts"], {
    cwd: backendRoot,
    env: { ...process.env, PORT: String(PORT), DB_PATH: DB_RELATIVE_PATH, NODE_ENV: "test" },
    stdio: "ignore",
  })
  await waitForHealth()
})

after(async () => {
  serverProcess.kill()
  await new Promise((r) => setTimeout(r, 300))
  await cleanupDbFiles()
})

test("POST /academy/mentor/request — без активной записи в программу: 403", async () => {
  const { token } = await register("mentorNoSub")
  const res = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 403)
})

test("POST /academy/mentor/request — тир founder_track (ниже circle) недостаточен: 403", async () => {
  const { token, userId } = await register("mentorTrack")
  seedEnrollment(userId, "founder_track")

  const res = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  assert.equal(res.status, 403)
})

test("POST /academy/mentor/request — активный founder_circle: 201, статус requested", async () => {
  const { token, userId } = await register("mentCircA")
  seedEnrollment(userId, "founder_circle")

  const res = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ notes: "Хочу обсудить unit-экономику" }),
  })
  assert.equal(res.status, 201)
  const body = (await res.json()) as { session: Record<string, unknown> }
  assert.equal(body.session.status, "requested")
  assert.equal(body.session.tier, "founder_circle")
  assert.equal(body.session.source, "subscription")
  assert.equal(body.session.notes, "Хочу обсудить unit-экономику")
  assert.match(body.session.periodYm as string, /^\d{4}-\d{2}$/)
})

test("POST /academy/mentor/request — второй запрос в том же месяце: 409 MENTOR_SLOT_TAKEN", async () => {
  const { token, userId } = await register("mentCircB")
  seedEnrollment(userId, "founder_circle")

  const first = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  assert.equal(first.status, 201)

  const second = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  assert.equal(second.status, 409)
  const body = (await second.json()) as { code: string }
  assert.equal(body.code, "MENTOR_SLOT_TAKEN")
})

test("GET /academy/mentor/my — canRequest=false после активного слота, true после его отмены", async () => {
  const { token, userId } = await register("mentCircC")
  seedEnrollment(userId, "founder_circle")

  const created = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  assert.equal(created.status, 201)
  const createdBody = (await created.json()) as { session: { id: number } }

  const myBefore = await fetch(`${BASE_URL}/academy/mentor/my`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const bodyBefore = (await myBefore.json()) as { canRequest: boolean; sessions: unknown[] }
  assert.equal(bodyBefore.canRequest, false)
  assert.equal(bodyBefore.sessions.length, 1)

  // Освобождаем месяц отменой (partial-unique index миграции 086 исключает status != 'canceled').
  cancelMentorSession(createdBody.session.id)

  const myAfter = await fetch(`${BASE_URL}/academy/mentor/my`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const bodyAfter = (await myAfter.json()) as { canRequest: boolean }
  assert.equal(bodyAfter.canRequest, true)

  // И новый запрос в том же календарном месяце теперь проходит.
  const second = await fetch(`${BASE_URL}/academy/mentor/request`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  assert.equal(second.status, 201)
})
