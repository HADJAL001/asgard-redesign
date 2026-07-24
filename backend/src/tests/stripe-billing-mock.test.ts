import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · Интеграционный тест: Stripe mock-режим (HTTP-цикл)
   ----------------------------------------------------------------
   Поднимает реальный backend отдельным процессом с явно пустым
   STRIPE_SECRET_KEY (форсирует mock-режим независимо от .env),
   проверяет полный цикл create-checkout → status → change-plan →
   cancel → start-trial → extra-package без обращения к Stripe API.
   Паттерн — как в orchestrator-flow.test.ts.
   ================================================================ */

const PORT = 3993
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-stripe-mock.db"
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

async function waitForHealth(timeoutMs = 45_000) {
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
      env: { ...process.env, DB_PATH: DB_RELATIVE_PATH, NODE_ENV: "test" },
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
  await runInitDb()
  serverProcess = spawn(process.execPath, [tsxCliPath, "src/server.ts"], {
    cwd: backendRoot,
    env: {
      ...process.env,
      PORT: String(PORT),
      DB_PATH: DB_RELATIVE_PATH,
      NODE_ENV: "test",
      // Форсируем mock-режим независимо от того, что задано в backend/.env
      STRIPE_SECRET_KEY: "",
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

async function registerUser(prefix: string): Promise<{ token: string; userId: number }> {
  const username = `${prefix}${Date.now() % 1_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "TestPass123!" }),
  })
  assert.equal(res.status, 201, `register должен вернуть 201, получено ${res.status}`)
  const body = (await res.json()) as { token: string; user: { id: number } }
  return { token: body.token, userId: body.user.id }
}

test("create-checkout (mock) активирует подписку и /status отражает план", async () => {
  const { token } = await registerUser("stripemockA")
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }

  const checkout = await fetch(`${BASE_URL}/subscription/create-checkout`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "pro" }),
  })
  assert.equal(checkout.status, 200)
  const checkoutBody = (await checkout.json()) as { mock: boolean; subscription: { plan: string; status: string } }
  assert.equal(checkoutBody.mock, true)
  assert.equal(checkoutBody.subscription.plan, "pro")
  assert.equal(checkoutBody.subscription.status, "active")

  const status = await fetch(`${BASE_URL}/subscription/status`, { headers: auth })
  assert.equal(status.status, 200)
  const statusBody = (await status.json()) as { subscription: { plan: string } }
  assert.equal(statusBody.subscription.plan, "pro")
})

test("change-plan (mock) меняет тариф, повторный вызов с тем же планом даёт 409", async () => {
  const { token } = await registerUser("stripemockB")
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }

  await fetch(`${BASE_URL}/subscription/create-checkout`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "pro" }),
  })

  const changed = await fetch(`${BASE_URL}/subscription/change-plan`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "supreme" }),
  })
  assert.equal(changed.status, 200)
  const changedBody = (await changed.json()) as { mock: boolean; subscription: { plan: string } }
  assert.equal(changedBody.mock, true)
  assert.equal(changedBody.subscription.plan, "supreme")

  const sameAgain = await fetch(`${BASE_URL}/subscription/change-plan`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "supreme" }),
  })
  assert.equal(sameAgain.status, 409)
})

test("cancel (mock) выставляет cancel_at_period_end", async () => {
  const { token } = await registerUser("stripemockC")
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }

  await fetch(`${BASE_URL}/subscription/create-checkout`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "pro" }),
  })

  const cancel = await fetch(`${BASE_URL}/subscription/cancel`, { method: "POST", headers: auth })
  assert.equal(cancel.status, 200)
  const cancelBody = (await cancel.json()) as { success: boolean; subscription: { cancelAtPeriodEnd: boolean; plan: string } }
  assert.equal(cancelBody.success, true)
  assert.equal(cancelBody.subscription.cancelAtPeriodEnd, true)
  // План остаётся активным до конца периода — доступ не отзывается сразу
  assert.equal(cancelBody.subscription.plan, "pro")
})

test("start-trial (mock) активирует trialing, повторный вызов на тот же план даёт 409", async () => {
  const { token } = await registerUser("stripemockD")
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }

  const trial = await fetch(`${BASE_URL}/subscription/start-trial`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "pro" }),
  })
  assert.equal(trial.status, 200)
  const trialBody = (await trial.json()) as {
    mock: boolean
    subscription: { plan: string; status: string }
    trialEndsAt: number
  }
  assert.equal(trialBody.mock, true)
  assert.equal(trialBody.subscription.plan, "pro")
  assert.equal(trialBody.subscription.status, "trialing")
  assert.equal(typeof trialBody.trialEndsAt, "number")

  const trialAgain = await fetch(`${BASE_URL}/subscription/start-trial`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ plan: "pro" }),
  })
  assert.equal(trialAgain.status, 409)
  const trialAgainBody = (await trialAgain.json()) as { trialUsed: boolean }
  assert.equal(trialAgainBody.trialUsed, true)
})

test("extra-package (mock) начисляет докупленный пакет в extra_credits", async () => {
  const { token, userId } = await registerUser("stripemockE")
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" }

  const purchase = await fetch(`${BASE_URL}/subscription/extra-package`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ provider: "claude" }),
  })
  assert.equal(purchase.status, 200)
  const purchaseBody = (await purchase.json()) as { mock: boolean }
  assert.equal(purchaseBody.mock, true)

  const checkDb = new Database(dbAbsolutePath)
  const row = checkDb
    .prepare(`SELECT balance FROM extra_credits WHERE user_id = ? AND provider = 'claude'`)
    .get(userId) as { balance: number } | undefined
  checkDb.close()
  assert.equal(row?.balance, 5)
})
