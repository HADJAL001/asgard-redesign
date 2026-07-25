import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · E2E: обязательная 2FA на выводе средств (POST /api/tc/withdraw)
   ----------------------------------------------------------------
   2FA-гейт стоит в обработчике ДО любых сетевых вызовов Solana (проверки
   баланса казны и т.п.), поэтому тест не требует моков блокчейна: юзер без
   2FA получает 403 мгновенно. Схема withdrawSchema требует amount, base58-
   адрес (44) и nonce — подаём валидные, чтобы дойти до 2FA-гейта, а не
   отвалиться на Joi.
   ================================================================ */

// Порт уникален среди spawn-тестов: node --test гоняет файлы конкурентно, и общий
// порт = гонка за bind → клиент попадает на ЧУЖОЙ сервер с другой БД (ловили: этот
// тест делил 3989 с orchestrator-flow → сид 2FA не виден → TWOFA_REQUIRED вместо
// TWOFA_TOKEN_REQUIRED только в полном прогоне). Занятые: 3987/88/89/90/93/94.
const PORT = 3991
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-withdraw-2fa.db"
const backendRoot = path.resolve(__dirname, "../..")
const dbAbsolutePath = path.resolve(backendRoot, DB_RELATIVE_PATH)
const tsxCliPath = require.resolve("tsx/cli")

// Валидный по withdrawSchema base58-адрес (44 символа из разрешённого алфавита).
const VALID_ADDRESS = "1".repeat(44)

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

async function register() {
  const username = `w2fa_${Date.now() % 100_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "password123" }),
  })
  assert.equal(res.status, 201, "регистрация должна вернуть 201")
  return (await res.json()) as { token: string; user: { id: number } }
}

function withdraw(token: string, body: Record<string, unknown>) {
  return fetch(`${BASE_URL}/api/tc/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
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

test("вывод без включённой 2FA → 403 TWOFA_REQUIRED", async () => {
  const { token } = await register()

  const res = await withdraw(token, {
    amount: 1,
    externalWalletAddress: VALID_ADDRESS,
    nonce: 0,
  })
  assert.equal(res.status, 403, "без 2FA вывод должен блокироваться")
  const body = (await res.json()) as { code?: string }
  assert.equal(body.code, "TWOFA_REQUIRED")
})

test("вывод с включённой 2FA, но без кода → 403 TWOFA_TOKEN_REQUIRED", async () => {
  const { token, user } = await register()

  // Включаем 2FA напрямую в БД (сид), как в walli-buy тесте.
  const seed = new Database(dbAbsolutePath)
  seed.prepare(`UPDATE users SET twofa_enabled = 1, twofa_secret = ? WHERE id = ?`).run("SEEDSECRET", user.id)
  seed.close()

  const res = await withdraw(token, {
    amount: 1,
    externalWalletAddress: VALID_ADDRESS,
    nonce: 0,
  })
  assert.equal(res.status, 403)
  const body = (await res.json()) as { code?: string }
  assert.equal(body.code, "TWOFA_TOKEN_REQUIRED")
})
