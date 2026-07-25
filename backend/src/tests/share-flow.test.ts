import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · E2E: публичный share-эндпоинт артефакта (без auth)
   ----------------------------------------------------------------
   Регистрируем юзера через реальный /auth/register, сеем артефакт
   напрямую в БД (INSERT строится динамически по PRAGMA table_info —
   устойчиво к любым NOT NULL-колонкам схемы Кузницы), затем бьём
   по GET /share/artifacts/:id БЕЗ авторизации и проверяем, что
   отдаются только безопасные поля.
   ================================================================ */

const PORT = 3990
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-share.db"
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

/** Сеет артефакт напрямую, покрывая все NOT NULL-колонки без дефолта. Возвращает id. */
function seedArtifact(ownerId: number, fields: Record<string, unknown>): number {
  const seed = new Database(dbAbsolutePath)
  try {
    const cols = seed.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{
      name: string
      type: string
      notnull: number
      dflt_value: unknown
      pk: number
    }>
    const values: Record<string, unknown> = { owner_id: ownerId, ...fields }
    for (const c of cols) {
      if (c.pk) continue
      if (c.name in values) continue
      if (c.dflt_value !== null) continue // есть дефолт — пропускаем
      if (c.notnull) values[c.name] = /INT|REAL|NUM/i.test(c.type) ? 0 : "" // добиваем NOT NULL
    }
    const names = Object.keys(values)
    const placeholders = names.map(() => "?").join(", ")
    const info = seed
      .prepare(`INSERT INTO artifacts (${names.join(", ")}) VALUES (${placeholders})`)
      .run(...names.map((n) => values[n]))
    return Number(info.lastInsertRowid)
  } finally {
    seed.close()
  }
}

async function register(): Promise<number> {
  const username = `shr_${Date.now() % 100_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "password123" }),
  })
  assert.equal(res.status, 201, "регистрация должна вернуть 201")
  const data = (await res.json()) as { user: { id: number } }
  return data.user.id
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

test("GET /share/artifacts/:id — публичный, отдаёт безопасные поля БЕЗ авторизации", async () => {
  const ownerId = await register()
  const artId = seedArtifact(ownerId, {
    name: "Молот Зари",
    type: "weapon",
    rarity: "legendary",
    power: 88,
    defense: 42,
    magic: 61,
    speed: 37,
  })

  // Без Authorization-заголовка (как соцкраулер).
  const res = await fetch(`${BASE_URL}/share/artifacts/${artId}`)
  assert.equal(res.status, 200, "публичный эндпоинт доступен без auth")
  const a = (await res.json()) as Record<string, unknown>

  assert.equal(a.name, "Молот Зари")
  assert.equal(a.rarity, "legendary")
  assert.equal(a.power, 88)
  assert.ok(typeof a.owner === "string" && (a.owner as string).length > 0, "есть публичное имя мастера")

  // КРИТИЧНО: не утекают персональные/внутренние поля.
  assert.equal(a.owner_id, undefined, "owner_id не отдаётся")
  assert.equal(a.email, undefined, "email не отдаётся")
  assert.equal(a.password_hash, undefined, "password_hash не отдаётся")
})

test("GET /share/artifacts/:id — 404 для несуществующего", async () => {
  const res = await fetch(`${BASE_URL}/share/artifacts/99999999`)
  assert.equal(res.status, 404)
})

test("GET /share/artifacts/:id — 400 для мусорного id", async () => {
  const res = await fetch(`${BASE_URL}/share/artifacts/abc`)
  assert.equal(res.status, 400)
})
