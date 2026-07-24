import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · Интеграционный тест: атомарность параллельных покупок
   ----------------------------------------------------------------
   Поднимает реальный backend отдельным процессом на изолированных
   порту и файле БД, регистрирует тестового пользователя через
   настоящий /auth/register, затем бьёт по POST /walli/buy/:item_id
   параллельными запросами на один и тот же предмет. Проверяет, что
   предмет куплен и TC списаны ровно один раз, а не N раз.
   ================================================================ */

const PORT = 3987
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-walli-buy.db"
const backendRoot = path.resolve(__dirname, "../..")
const dbAbsolutePath = path.resolve(backendRoot, DB_RELATIVE_PATH)
/* Спавним tsx напрямую через node, минуя npx/cmd.exe — на Windows
   spawn(..., { shell: true }) порождает дерево cmd.exe → npx → node, и
   обычный kill() убивает только верхний cmd.exe, оставляя реальный
   node-процесс (и его хендл на файл БД) висеть в памяти. Прямой спавн
   node на CLI-файле tsx делает наш child_process самим нужным процессом. */
const tsxCliPath = require.resolve("tsx/cli")

let serverProcess: ChildProcess

async function cleanupDbFiles() {
  // На Windows файл БД остаётся залоченным ещё несколько мс после kill()
  // дочернего процесса (хендл SQLite освобождается не мгновенно) — ретраим.
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
      // сервер ещё не поднялся — пробуем снова
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error("Тестовый сервер не поднялся вовремя")
}

function runInitDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const initProcess = spawn(process.execPath, [tsxCliPath, "src/scripts/init-db.ts"], {
      cwd: backendRoot,
      env: {
        ...process.env,
        DB_PATH: DB_RELATIVE_PATH,
        NODE_ENV: "test",
      },
      stdio: "ignore",
    })
    initProcess.on("exit", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`init-db завершился с кодом ${code}`))
    })
    initProcess.on("error", reject)
  })
}

before(async () => {
  await cleanupDbFiles()
  /* server.ts содержит только инкрементальные миграции (предполагают, что
     базовые таблицы вроде users уже существуют) — на чистом файле БД без
     схемы сервер падает на первой же из них (017_community.ts: "no such
     table: users"). Сначала прогоняем init-db.ts, который создаёт базовую
     схему (CREATE TABLE IF NOT EXISTS) и идемпотентен. */
  await runInitDb()
  serverProcess = spawn(process.execPath, [tsxCliPath, "src/server.ts"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: DB_RELATIVE_PATH,
      NODE_ENV: "test",
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

test("параллельные покупки одного предмета атомарны — куплен и списан ровно один раз", async () => {
  // USERNAME_RE в validators.ts допускает максимум 20 символов
  const username = `atomic_${Date.now() % 100_000_000}`
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@test.local`,
      password: "password123",
    }),
  })
  assert.equal(registerRes.status, 201)
  const { token, user } = (await registerRes.json()) as { token: string; user: { id: number } }

  const seedDb = new Database(dbAbsolutePath)
  seedDb.prepare(`UPDATE wallets SET timecoin = 1000 WHERE user_id = ?`).run(user.id)
  seedDb.close()

  const CONCURRENCY = 5
  const responses = await Promise.all(
    Array.from({ length: CONCURRENCY }, () =>
      fetch(`${BASE_URL}/walli/buy/genesis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
    ),
  )
  const statuses = responses.map((r) => r.status).sort()

  const successCount = statuses.filter((s) => s === 200).length
  const conflictCount = statuses.filter((s) => s === 409).length
  assert.equal(successCount, 1, `Ожидался ровно 1 успешный ответ, получено: ${JSON.stringify(statuses)}`)
  assert.equal(conflictCount, CONCURRENCY - 1, `Остальные должны быть 409, получено: ${JSON.stringify(statuses)}`)

  const checkDb = new Database(dbAbsolutePath)
  const owned = checkDb
    .prepare(`SELECT COUNT(*) as c FROM walli_items WHERE user_id = ? AND item_key = 'genesis'`)
    .get(user.id) as { c: number }
  const wallet = checkDb.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(user.id) as {
    timecoin: number
  }
  checkDb.close()

  assert.equal(owned.c, 1, "Предмет должен быть куплен ровно один раз")
  assert.equal(wallet.timecoin, 1000 - 50, "TC должны списаться ровно один раз (цена genesis = 50)")
})
