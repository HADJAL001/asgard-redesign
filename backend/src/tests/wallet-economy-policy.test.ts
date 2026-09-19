import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

const PORT = 4995
const BASE = `http://127.0.0.1:${PORT}`
const ROOT = path.resolve(__dirname, "../..")
const DB_RELATIVE = "./data/test-wallet-economy-policy.db"
const DB_PATH = path.resolve(ROOT, DB_RELATIVE)
const tsxCli = require.resolve("tsx/cli")
let server: ChildProcess

function removeDatabase() {
  for (const suffix of ["", "-wal", "-shm"]) if (fs.existsSync(DB_PATH + suffix)) fs.rmSync(DB_PATH + suffix, { force: true })
}

function run(script: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, script], {
      cwd: ROOT,
      env: { ...process.env, DB_PATH: DB_RELATIVE, NODE_ENV: "test" },
      stdio: "ignore",
    })
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`init failed: ${code}`)))
  })
}

async function waitForHealth() {
  const until = Date.now() + 30_000
  while (Date.now() < until) {
    try { if ((await fetch(`${BASE}/health`)).ok) return } catch {}
    await new Promise(resolve => setTimeout(resolve, 150))
  }
  throw new Error("server did not start")
}

async function register() {
  const response = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "economyuser", email: "economy@test.local", password: "TestPass123!" }),
  })
  assert.equal(response.status, 201)
  return await response.json() as { token: string; user: { id: number } }
}

const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" })

before(async () => {
  removeDatabase()
  await run("src/scripts/init-db.ts")
  server = spawn(process.execPath, [tsxCli, "src/server.ts"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DB_PATH: DB_RELATIVE, NODE_ENV: "test" },
    stdio: "ignore",
  })
  await waitForHealth()
})

after(async () => {
  server?.kill()
  await new Promise(resolve => setTimeout(resolve, 250))
  removeDatabase()
})

test("wallet blocks legacy conversion without mutating balances and keeps material purchases available", async () => {
  const user = await register()
  const db = new Database(DB_PATH)
  db.prepare(`UPDATE wallets SET credits = 1000, shards = 0, crystals = 0, cash_usd = 0, timecoin = 0 WHERE user_id = ?`).run(user.user.id)

  for (const body of [
    { from: "credits", to: "cash_usd", amount: 100 },
    { from: "shards", to: "credits", amount: 1 },
    { from: "timecoin", to: "cash_usd", amount: 1 },
  ]) {
    const response = await fetch(`${BASE}/wallet/convert`, { method: "POST", headers: auth(user.token), body: JSON.stringify(body) })
    assert.equal(response.status, 410)
  }

  assert.deepEqual(db.prepare(`SELECT credits, shards, crystals, cash_usd, timecoin FROM wallets WHERE user_id = ?`).get(user.user.id), {
    credits: 1000, shards: 0, crystals: 0, cash_usd: 0, timecoin: 0,
  })

  const purchase = await fetch(`${BASE}/wallet/materials/buy`, {
    method: "POST",
    headers: auth(user.token),
    body: JSON.stringify({ material: "shards", packs: 1 }),
  })
  assert.equal(purchase.status, 201)
  const row = db.prepare(`SELECT credits, shards FROM wallets WHERE user_id = ?`).get(user.user.id) as { credits: number; shards: number }
  assert.ok(row.credits < 1000)
  assert.ok(row.shards > 0)
  db.close()
})
