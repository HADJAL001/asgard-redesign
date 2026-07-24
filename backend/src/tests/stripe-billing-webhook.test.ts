import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"
import Stripe from "stripe"

/* ================================================================
   OSGARD · Интеграционный тест: Stripe webhook (подпись, эффекты,
   идемпотентность, разделение секретов между эндпоинтами)
   ----------------------------------------------------------------
   Поднимает backend с фейковым, но синтаксически валидным
   STRIPE_SECRET_KEY (constructEvent — чистая локальная HMAC-проверка,
   реальной сети к Stripe не требует) и двумя РАЗНЫМИ webhook-секретами
   для /subscription/webhook и /addons/webhook — как в проде, где
   каждый зарегистрированный endpoint имеет собственный секрет.

   stripe.webhooks.generateTestHeaderString() строит валидную подпись
   без Stripe CLI (который локально не установлен).
   ================================================================ */

const PORT = 3994
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-stripe-webhook.db"
const backendRoot = path.resolve(__dirname, "../..")
const dbAbsolutePath = path.resolve(backendRoot, DB_RELATIVE_PATH)
const tsxCliPath = require.resolve("tsx/cli")

const FAKE_SECRET_KEY = "sk_test_fake_00000000000000000000000000"
const SUBSCRIPTION_WEBHOOK_SECRET = "whsec_test_subscription_secret"
const ADDONS_WEBHOOK_SECRET = "whsec_test_addons_secret"
const FAKE_PRICE_PRO = "price_test_pro_123"

const stripeSigner = new Stripe(FAKE_SECRET_KEY, { apiVersion: "2025-08-27.basil" as any })

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
      STRIPE_SECRET_KEY: FAKE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: SUBSCRIPTION_WEBHOOK_SECRET,
      STRIPE_WEBHOOK_SECRET_ADDONS: ADDONS_WEBHOOK_SECRET,
      STRIPE_PRICE_PRO: FAKE_PRICE_PRO,
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

function sign(payload: string, secret: string): string {
  return stripeSigner.webhooks.generateTestHeaderString({ payload, secret })
}

async function postWebhook(urlPath: string, eventObj: unknown, secret: string) {
  const payload = JSON.stringify(eventObj)
  const signature = sign(payload, secret)
  return fetch(`${BASE_URL}${urlPath}`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signature },
    body: payload,
  })
}

function readSubscriptionRow(userId: number): any {
  const conn = new Database(dbAbsolutePath)
  const row = conn.prepare(`SELECT * FROM subscriptions WHERE user_id = ?`).get(userId)
  conn.close()
  return row
}

test("webhook с неверной подписью отклоняется с 400", async () => {
  const res = await fetch(`${BASE_URL}/subscription/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
    body: JSON.stringify({ id: "evt_bad_signature", type: "customer.subscription.updated", data: { object: {} } }),
  })
  assert.equal(res.status, 400)
})

test("customer.subscription.updated обновляет план/статус по price_id, invoice.payment_failed создаёт уведомление и failed-транзакцию, повтор того же event.id идемпотентен", async () => {
  const { userId } = await registerUser("stripewhA")
  const stripeSubId = `sub_test_${userId}`

  const updatedEvent = {
    id: `evt_sub_updated_${userId}`,
    type: "customer.subscription.updated",
    data: {
      object: {
        id: stripeSubId,
        status: "active",
        items: { data: [{ price: { id: FAKE_PRICE_PRO } }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        cancel_at_period_end: false,
        metadata: { userId: String(userId) },
      },
    },
  }

  const res1 = await postWebhook("/subscription/webhook", updatedEvent, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(res1.status, 200)
  const body1 = (await res1.json()) as { received: boolean }
  assert.equal(body1.received, true)

  const subRow = readSubscriptionRow(userId)
  assert.equal(subRow.plan, "pro")
  assert.equal(subRow.status, "active")
  assert.equal(subRow.stripe_subscription_id, stripeSubId)
  assert.equal(subRow.stripe_price_id, FAKE_PRICE_PRO)
  assert.equal(subRow.cancel_at_period_end, 0)

  const failedEvent = {
    id: `evt_invoice_failed_${userId}`,
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_test_1",
        subscription: stripeSubId,
        customer: "cus_test_1",
        amount_due: 2900,
      },
    },
  }

  const res2 = await postWebhook("/subscription/webhook", failedEvent, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(res2.status, 200)

  const conn = new Database(dbAbsolutePath)
  const notification = conn
    .prepare(`SELECT text FROM notifications WHERE user_id = ? AND type = 'billing' ORDER BY id DESC LIMIT 1`)
    .get(userId) as { text: string } | undefined
  const failedTx = conn
    .prepare(`SELECT amount, status FROM transactions WHERE user_id = ? AND status = 'failed' ORDER BY id DESC LIMIT 1`)
    .get(userId) as { amount: number; status: string } | undefined
  const notificationsCountBefore = (
    conn.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ?`).get(userId) as { c: number }
  ).c
  conn.close()

  assert.ok(notification?.text.includes("pro"), "уведомление должно упоминать тариф")
  assert.equal(failedTx?.status, "failed")
  assert.equal(failedTx?.amount, 29)

  // Повторная доставка того же event.id — идемпотентность, без повторной обработки
  const res3 = await postWebhook("/subscription/webhook", failedEvent, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(res3.status, 200)
  const body3 = (await res3.json()) as { received: boolean; duplicate: boolean }
  assert.equal(body3.duplicate, true)

  const connAfter = new Database(dbAbsolutePath)
  const notificationsCountAfter = (
    connAfter.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ?`).get(userId) as { c: number }
  ).c
  connAfter.close()
  assert.equal(notificationsCountAfter, notificationsCountBefore, "дубликат не должен создавать повторное уведомление")
})

test("customer.subscription.deleted переводит подписку на free/canceled", async () => {
  const { userId } = await registerUser("stripewhB")
  const stripeSubId = `sub_test_del_${userId}`

  await postWebhook(
    "/subscription/webhook",
    {
      id: `evt_sub_updated_before_delete_${userId}`,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: stripeSubId,
          status: "active",
          items: { data: [{ price: { id: FAKE_PRICE_PRO } }] },
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
          cancel_at_period_end: false,
          metadata: { userId: String(userId) },
        },
      },
    },
    SUBSCRIPTION_WEBHOOK_SECRET,
  )

  const deletedEvent = {
    id: `evt_sub_deleted_${userId}`,
    type: "customer.subscription.deleted",
    data: { object: { id: stripeSubId, metadata: { userId: String(userId) } } },
  }
  const res = await postWebhook("/subscription/webhook", deletedEvent, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(res.status, 200)

  const subRow = readSubscriptionRow(userId)
  assert.equal(subRow.plan, "free")
  assert.equal(subRow.status, "canceled")
  assert.ok(subRow.canceled_at !== null)
})

test("checkout.session.completed (mode: payment) начисляет докупленный пакет в extra_credits", async () => {
  const { userId } = await registerUser("stripewhC")

  const event = {
    id: `evt_checkout_payment_${userId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_payment_1",
        mode: "payment",
        metadata: { userId: String(userId), provider: "claude", amount: "5" },
        amount_total: 1900,
        customer: "cus_test_payment_1",
      },
    },
  }

  const res = await postWebhook("/subscription/webhook", event, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(res.status, 200)

  const conn = new Database(dbAbsolutePath)
  const credits = conn
    .prepare(`SELECT balance FROM extra_credits WHERE user_id = ? AND provider = 'claude'`)
    .get(userId) as { balance: number } | undefined
  const purchaseTx = conn
    .prepare(`SELECT status FROM transactions WHERE user_id = ? AND type = 'purchase' AND status = 'done'`)
    .get(userId) as { status: string } | undefined
  conn.close()

  assert.equal(credits?.balance, 5)
  assert.equal(purchaseTx?.status, "done")
})

test("checkout.session.completed (mode: subscription, без session.subscription) активирует подписку без обращения к Stripe API", async () => {
  const { userId } = await registerUser("stripewhD")

  const event = {
    id: `evt_checkout_sub_${userId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_sub_1",
        mode: "subscription",
        metadata: { userId: String(userId), plan: "pro" },
        amount_total: 2900,
        customer: "cus_test_sub_1",
        // session.subscription намеренно не задан — обработчик не должен
        // обращаться к stripe.subscriptions.retrieve()
      },
    },
  }

  const res = await postWebhook("/subscription/webhook", event, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(res.status, 200)

  const subRow = readSubscriptionRow(userId)
  assert.equal(subRow.plan, "pro")
  assert.equal(subRow.status, "active")
  assert.equal(subRow.stripe_subscription_id, null)
})

test("/addons/webhook отклоняет событие, подписанное секретом /subscription/webhook, и принимает своё", async () => {
  const event = {
    id: `evt_addons_wrong_secret_${Date.now()}`,
    type: "customer.subscription.updated",
    data: { object: { id: "sub_addons_test", status: "active", metadata: {} } },
  }

  const wrongSecretRes = await postWebhook("/addons/webhook", event, SUBSCRIPTION_WEBHOOK_SECRET)
  assert.equal(wrongSecretRes.status, 400, "подпись секретом другого endpoint-а должна отклоняться")

  const correctSecretRes = await postWebhook("/addons/webhook", event, ADDONS_WEBHOOK_SECRET)
  assert.equal(correctSecretRes.status, 200, "подпись собственным секретом должна приниматься")
})
