import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · E2E: ротация refresh-токенов и детекция кражи по HTTP
   ----------------------------------------------------------------
   Поднимает реальный backend отдельным процессом на изолированных порту
   и файле БД и гоняет полный контракт /auth/refresh, от которого зависят
   web-proxy и мобильный клиент: ротация, продолжение цепочки, детекция
   повторного использования, убийство семьи, отзыв на logout.

   REFRESH_GRACE_MS=0 — убираем grace-окно, чтобы повторный приход уже
   отозванного токена детектился как reuse немедленно (иначе пришлось бы
   ждать 60с реального времени).
   ================================================================ */

const PORT = 3988
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-refresh-flow.db"
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
      /* сервер ещё не поднялся */
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

async function register() {
  const username = `rt_${Date.now() % 100_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "password123" }),
  })
  assert.equal(res.status, 201, "регистрация должна вернуть 201")
  return (await res.json()) as { token: string; refreshToken: string; user: { id: number } }
}

function refresh(refreshToken: string) {
  return fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
}

before(async () => {
  await cleanupDbFiles()
  await runInitDb()
  serverProcess = spawn(process.execPath, [tsxCliPath, "src/server.ts"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: DB_RELATIVE_PATH,
      NODE_ENV: "test",
      REFRESH_GRACE_MS: "0", // мгновенная детекция reuse
    },
    stdio: "ignore",
  })
  await waitForHealth()
})

after(async () => {
  serverProcess.kill()
  await new Promise((r) => setTimeout(r, 300))
  await cleanupDbFiles()
})

test("ротация: refresh выдаёт новый access и новый refresh, цепочка продолжается", async () => {
  const { refreshToken: rt1 } = await register()

  const r1 = await refresh(rt1)
  assert.equal(r1.status, 200)
  const d1 = (await r1.json()) as { accessToken: string; refreshToken: string }
  assert.ok(d1.accessToken, "должен вернуться accessToken")
  assert.ok(d1.refreshToken && d1.refreshToken !== rt1, "refresh должен ротироваться")

  // Новый токен продолжает цепочку.
  const r2 = await refresh(d1.refreshToken)
  assert.equal(r2.status, 200)
  const d2 = (await r2.json()) as { refreshToken: string }
  assert.ok(d2.refreshToken && d2.refreshToken !== d1.refreshToken)
})

test("детекция кражи: повторное использование старого токена → 401 и убийство семьи", async () => {
  const { refreshToken: rt1 } = await register()

  const r1 = await refresh(rt1)
  const { refreshToken: rt2 } = (await r1.json()) as { refreshToken: string }

  // Повторно предъявляем УЖЕ ротированный rt1 (grace=0) → детекция reuse.
  const reuse = await refresh(rt1)
  assert.equal(reuse.status, 401, "reuse старого токена → 401")
  const body = (await reuse.json()) as { code?: string }
  assert.equal(body.code, "REFRESH_REUSE")

  // Семья убита — валидный до этого rt2 больше не работает.
  const afterKill = await refresh(rt2)
  assert.equal(afterKill.status, 401, "после детекции кражи вся семья отозвана")
})

test("logout отзывает refresh-сессию — последующий refresh даёт 401", async () => {
  const { token, refreshToken } = await register()

  const out = await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ refreshToken }),
  })
  assert.equal(out.status, 200)

  const afterLogout = await refresh(refreshToken)
  assert.equal(afterLogout.status, 401, "отозванный на logout токен не должен обновляться")
})

test("невалидный refresh-токен → 401", async () => {
  const res = await refresh("totally-not-a-real-token")
  assert.equal(res.status, 401)
})
