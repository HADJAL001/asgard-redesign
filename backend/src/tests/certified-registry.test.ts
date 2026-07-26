import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import Database from "better-sqlite3"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · E2E: публичный реестр «OSGARD Certified Vibecoder»
   ----------------------------------------------------------------
   Поднимает реальный backend отдельным процессом (миграции 084/086
   исполняются самовызовом при импорте server.ts), регистрирует юзера
   через /auth/register, сеет academy_certificates напрямую в БД,
   затем бьёт по GET /certified и GET /certified/:serial БЕЗ auth и
   проверяет пагинацию/лимиты, issued/revoked/not-found и отсутствие
   PII (snapshot_json, user_id, revoke_reason) в публичном ответе.
   Паттерн — как в share-flow.test.ts.
   ================================================================ */

const PORT = 4501
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-certified-registry-2.db"
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

async function register(prefix: string): Promise<number> {
  const username = `${prefix}${Date.now() % 100_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "password123" }),
  })
  assert.equal(res.status, 201, "регистрация должна вернуть 201")
  const data = (await res.json()) as { user: { id: number } }
  return data.user.id
}

/** Сеет credential напрямую в academy_certificates (обходя eligibility-гейт — не его тестируем здесь). */
function seedCertificate(
  userId: number,
  fields: { serial: string; tier?: string; status?: "issued" | "revoked"; revokedAt?: number | null },
): number {
  const seed = new Database(dbAbsolutePath)
  try {
    const info = seed
      .prepare(
        `INSERT INTO academy_certificates (user_id, serial, tier, status, snapshot_json, issued_at, revoked_at, revoked_by, revoke_reason, created_at)
         VALUES (?, ?, ?, ?, '{"secret":"internal-snapshot"}', ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        fields.serial,
        fields.tier ?? "founder_track",
        fields.status ?? "issued",
        Date.now(),
        fields.status === "revoked" ? (fields.revokedAt ?? Date.now()) : null,
        fields.status === "revoked" ? 1 : null,
        fields.status === "revoked" ? "internal-revoke-reason" : null,
        Date.now(),
      )
    return Number(info.lastInsertRowid)
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

test("GET /certified — пустой реестр в начале", async () => {
  const res = await fetch(`${BASE_URL}/certified`)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { certificates: unknown[]; total: number }
  assert.equal(body.total, 0)
  assert.deepEqual(body.certificates, [])
})

test("GET /certified — issued credential виден в реестре, только публичные поля", async () => {
  const userId = await register("regA")
  seedCertificate(userId, { serial: "OSGARD-VC-TEST-0001-AAAA", tier: "founder_circle" })

  const res = await fetch(`${BASE_URL}/certified`)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { certificates: Record<string, unknown>[]; total: number }
  assert.equal(body.total, 1)
  assert.equal(body.certificates.length, 1)

  const cert = body.certificates[0]
  assert.equal(cert.serial, "OSGARD-VC-TEST-0001-AAAA")
  assert.equal(cert.tier, "founder_circle")
  assert.equal(cert.status, "issued")
  assert.equal(cert.revokedAt, null)
  assert.ok(typeof cert.holderName === "string" && (cert.holderName as string).length > 0)

  // КРИТИЧНО: не утекают внутренние поля.
  assert.equal(cert.user_id, undefined, "user_id не отдаётся")
  assert.equal(cert.snapshot, undefined, "snapshot не отдаётся публично")
  assert.equal(cert.snapshot_json, undefined, "snapshot_json не отдаётся")
  assert.equal(cert.revoke_reason, undefined, "revoke_reason не отдаётся")
})

test("GET /certified — revoked credential НЕ виден в публичном реестре", async () => {
  const userId = await register("regB")
  seedCertificate(userId, { serial: "OSGARD-VC-TEST-0002-BBBB", status: "revoked" })

  const res = await fetch(`${BASE_URL}/certified`)
  const body = (await res.json()) as { certificates: Record<string, unknown>[] }
  assert.ok(
    !body.certificates.some((c) => c.serial === "OSGARD-VC-TEST-0002-BBBB"),
    "отозванный credential не должен попадать в публичный реестр",
  )
})

test("GET /certified — пагинация через limit/offset", async () => {
  // Партиал-уникальный индекс допускает только ОДИН issued credential на user_id —
  // для проверки пагинации нужно 5 разных пользователей, а не 5 сертификатов одному.
  for (let i = 0; i < 5; i++) {
    const userId = await register(`regC${i}`)
    seedCertificate(userId, { serial: `OSGARD-VC-PAGE-000${i}-CCCC` })
  }

  const page1 = await fetch(`${BASE_URL}/certified?limit=2&offset=0`)
  const body1 = (await page1.json()) as { certificates: unknown[]; limit: number; offset: number }
  assert.equal(body1.certificates.length, 2)
  assert.equal(body1.limit, 2)
  assert.equal(body1.offset, 0)

  const page2 = await fetch(`${BASE_URL}/certified?limit=2&offset=2`)
  const body2 = (await page2.json()) as { certificates: unknown[] }
  assert.equal(body2.certificates.length, 2)

  // limit зажат в [1,100]
  const clamped = await fetch(`${BASE_URL}/certified?limit=99999`)
  const clampedBody = (await clamped.json()) as { limit: number }
  assert.equal(clampedBody.limit, 100)
})

test("GET /certified/:serial — issued: found=true, status=issued", async () => {
  const userId = await register("verA")
  seedCertificate(userId, { serial: "OSGARD-VC-VER-0001-DDDD" })

  const res = await fetch(`${BASE_URL}/certified/OSGARD-VC-VER-0001-DDDD`)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { found: boolean; certificate: Record<string, unknown> }
  assert.equal(body.found, true)
  assert.equal(body.certificate.status, "issued")
  assert.equal(body.certificate.revokedAt, null)
})

test("GET /certified/:serial — revoked: found=true, статус честно раскрывается", async () => {
  const userId = await register("verB")
  const revokedAt = Date.now()
  seedCertificate(userId, { serial: "OSGARD-VC-VER-0002-EEEE", status: "revoked", revokedAt })

  const res = await fetch(`${BASE_URL}/certified/OSGARD-VC-VER-0002-EEEE`)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { found: boolean; certificate: Record<string, unknown> }
  assert.equal(body.found, true)
  assert.equal(body.certificate.status, "revoked")
  assert.equal(body.certificate.revokedAt, revokedAt)
})

test("GET /certified/:serial — не найден: 404, found=false", async () => {
  const res = await fetch(`${BASE_URL}/certified/OSGARD-VC-NOPE-NOPE-NOPE`)
  assert.equal(res.status, 404)
  const body = (await res.json()) as { found: boolean }
  assert.equal(body.found, false)
})

test("GET /certified/:serial — пустой (пробельный) serial: 400", async () => {
  const res = await fetch(`${BASE_URL}/certified/%20`)
  assert.equal(res.status, 400)
  const body = (await res.json()) as { found: boolean }
  assert.equal(body.found, false)
})

test("GET /certified/:serial — регистр serial не важен (нормализуется в uppercase)", async () => {
  const userId = await register("verC")
  seedCertificate(userId, { serial: "OSGARD-VC-VER-0003-FFFF" })

  const res = await fetch(`${BASE_URL}/certified/osgard-vc-ver-0003-ffff`)
  assert.equal(res.status, 200)
  const body = (await res.json()) as { found: boolean }
  assert.equal(body.found, true)
})
