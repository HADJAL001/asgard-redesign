import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import { spawn, ChildProcess } from "node:child_process"
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"

/* ================================================================
   OSGARD · Интеграционный тест: оркестратор AI-цепочек
   ----------------------------------------------------------------
   Поднимает реальный backend отдельным процессом на изолированных
   порту и файле БД (см. walli-buy-atomicity.test.ts — тот же паттерн),
   бьёт по реальным /orchestrator/* роутам и проверяет полный
   жизненный цикл: создание → PUT-пересохранение → валидация пустого
   input → запуск → SSE до chain_done → списание TC → нехватка TC.
   ================================================================ */

const PORT = 3989
const BASE_URL = `http://localhost:${PORT}`
const DB_RELATIVE_PATH = "./data/test-orchestrator.db"
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

async function registerUser(prefix: string): Promise<{ token: string; userId: number }> {
  const username = `${prefix}${Date.now() % 1_000_000}`
  const res = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "TestPass123!" }),
  })
  assert.equal(res.status, 201, `register должен вернуть 201, получено ${res.status}`)
  const body = (await res.json()) as { token: string; user: { id: number } }

  // Оркестратор доступен только на Supreme+ (см. orchestrator.routes.ts:
  // requireOrchestratorAccess) — свежезарегистрированный пользователь по
  // умолчанию на free, поднимаем план напрямую в БД, как в
  // walli-buy-atomicity.test.ts.
  const planDb = new DatabaseSync(dbAbsolutePath)
  planDb.prepare(`UPDATE users SET plan = 'supreme' WHERE id = ?`).run(body.user.id)
  planDb.close()

  return { token: body.token, userId: body.user.id }
}

/** Читает SSE-поток запуска до терминального события (chain_done/chain_error) или таймаута. */
function readSse(executionId: number, token: string): Promise<any[]> {
  return new Promise((resolve) => {
    const events: any[] = []
    const controller = new AbortController()
    const timeout = setTimeout(() => {
      controller.abort()
      resolve(events)
    }, 10_000)

    fetch(`${BASE_URL}/orchestrator/stream/${executionId}`, {
      headers: { authorization: `Bearer ${token}`, accept: "text/event-stream" },
      signal: controller.signal,
    })
      .then(async (res) => {
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          let idx: number
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            const line = chunk.split("\n").find((l) => l.startsWith("data:"))
            if (line) {
              const payload = JSON.parse(line.slice(5).trim())
              events.push(payload)
              if (payload.type === "chain_done" || payload.type === "chain_error") {
                clearTimeout(timeout)
                controller.abort()
                resolve(events)
                return
              }
            }
          }
        }
        clearTimeout(timeout)
        resolve(events)
      })
      .catch(() => {
        clearTimeout(timeout)
        resolve(events)
      })
  })
}

test("создание, PUT-пересохранение и валидация пустого input", async () => {
  const { token } = await registerUser("orchsave")
  const auth = { authorization: `Bearer ${token}` }

  const nodes = [
    { id: "n1", position: { x: 0, y: 0 }, data: { type: "prompt_template", label: "Шаг 1", template: "Привет, {{input}}!" } },
    { id: "n2", position: { x: 200, y: 0 }, data: { type: "prompt_template", label: "Шаг 2", template: "{{input}} — конец." } },
  ]
  const edges = [{ id: "e1", source: "n1", target: "n2" }]

  const created = await fetch(`${BASE_URL}/orchestrator/chains`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: "Проверка интеграции", nodes, edges }),
  })
  assert.equal(created.status, 201)
  const { chain } = (await created.json()) as { chain: { id: number } }
  assert.equal(typeof chain.id, "number")

  // PUT — то самое место, где раньше был баг во фронте (POST вместо PUT при пересохранении).
  const updated = await fetch(`${BASE_URL}/orchestrator/chains/${chain.id}`, {
    method: "PUT",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: "Проверка интеграции (изменено)", nodes, edges }),
  })
  assert.equal(updated.status, 200)
  const updatedBody = (await updated.json()) as { chain: { name: string } }
  assert.equal(updatedBody.chain.name, "Проверка интеграции (изменено)")

  const emptyRun = await fetch(`${BASE_URL}/orchestrator/chains/${chain.id}/run`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ input: "   " }),
  })
  assert.equal(emptyRun.status, 400)
})

test("успешный запуск цепочки из prompt_template-узлов: cost=0, chain_done и node_statuses корректны", async () => {
  const { token } = await registerUser("orchrun")
  const auth = { authorization: `Bearer ${token}` }

  const nodes = [
    { id: "n1", position: { x: 0, y: 0 }, data: { type: "prompt_template", label: "Шаг 1", template: "Привет, {{input}}!" } },
    { id: "n2", position: { x: 200, y: 0 }, data: { type: "prompt_template", label: "Шаг 2", template: "{{input}} — конец." } },
  ]
  const edges = [{ id: "e1", source: "n1", target: "n2" }]

  const created = await fetch(`${BASE_URL}/orchestrator/chains`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: "Цепочка для запуска", nodes, edges }),
  })
  const { chain } = (await created.json()) as { chain: { id: number } }

  const run = await fetch(`${BASE_URL}/orchestrator/chains/${chain.id}/run`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ input: "мир" }),
  })
  assert.equal(run.status, 202)
  const runBody = (await run.json()) as { executionId: number; cost: number }
  assert.equal(runBody.cost, 0, "оба узла — prompt_template, стоимость должна быть 0 TC")

  const events = await readSse(runBody.executionId, token)
  const chainDone = events.find((e) => e.type === "chain_done")
  assert.ok(chainDone, `chain_done не получен, события: ${JSON.stringify(events)}`)
  assert.equal(chainDone.output, "Привет, мир! — конец.")

  /* Цепочка из prompt_template-узлов выполняется полностью синхронно (без await
     на реальный I/O) — она успевает завершиться быстрее, чем клиент откроет SSE-
     соединение после получения ответа run(). Поэтому node_start/node_done для
     n1/n2 тут в потоке не наблюдаемы (см. orchestrator.routes.ts:191-198 — при
     подключении к уже завершённому execution отдаётся только терминальное
     событие) — это ожидаемое поведение, а не баг. Итоговый статус по каждому
     узлу проверяем через персистентную запись execution, а не через живой поток. */
  const executionRes = await fetch(`${BASE_URL}/orchestrator/executions/${runBody.executionId}`, { headers: auth })
  assert.equal(executionRes.status, 200)
  const { execution } = (await executionRes.json()) as {
    execution: { status: string; node_statuses: Array<{ nodeId: string; status: string; output?: string }> }
  }
  assert.equal(execution.status, "success")
  const n1Status = execution.node_statuses.find((s) => s.nodeId === "n1")
  const n2Status = execution.node_statuses.find((s) => s.nodeId === "n2")
  assert.equal(n1Status?.status, "done")
  assert.equal(n1Status?.output, "Привет, мир!")
  assert.equal(n2Status?.status, "done")
  assert.equal(n2Status?.output, "Привет, мир! — конец.")
})

test("SSE-подключение к уже завершённому execution отдаёт только терминальное событие", async () => {
  const { token } = await registerUser("orchreplay")
  const auth = { authorization: `Bearer ${token}` }

  const nodes = [{ id: "n1", position: { x: 0, y: 0 }, data: { type: "prompt_template", label: "Шаг", template: "{{input}}!" } }]
  const created = await fetch(`${BASE_URL}/orchestrator/chains`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: "Цепочка для реконнекта", nodes, edges: [] }),
  })
  const { chain } = (await created.json()) as { chain: { id: number } }

  const run = await fetch(`${BASE_URL}/orchestrator/chains/${chain.id}/run`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ input: "тест" }),
  })
  const { executionId } = (await run.json()) as { executionId: number }

  // К моменту получения ответа run() цепочка из одного prompt_template-узла уже
  // выполнена — переподключение к SSE должно вернуть ровно одно событие chain_done.
  const events = await readSse(executionId, token)
  assert.equal(events.length, 1, `ожидалось ровно одно терминальное событие, получено: ${JSON.stringify(events)}`)
  assert.equal(events[0].type, "chain_done")
})

test("цепочка с оплачиваемым узлом отклоняется с 400 при нехватке TimeCoin", async () => {
  const { token } = await registerUser("orchpaid")
  const auth = { authorization: `Bearer ${token}` }

  const paidNodes = [
    { id: "p1", position: { x: 0, y: 0 }, data: { type: "claude", label: "Claude", systemPrompt: "", temperature: 0.7, maxTokens: 100 } },
  ]
  const created = await fetch(`${BASE_URL}/orchestrator/chains`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ name: "Платная цепочка", nodes: paidNodes, edges: [] }),
  })
  assert.equal(created.status, 201)
  const { chain } = (await created.json()) as { chain: { id: number } }

  // Свежезарегистрированный пользователь стартует с balance=0 TC, claude-узел стоит 5 TC.
  const run = await fetch(`${BASE_URL}/orchestrator/chains/${chain.id}/run`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ input: "тест" }),
  })
  assert.equal(run.status, 400)
  const body = (await run.json()) as { error: string }
  assert.match(body.error, /Недостаточно TimeCoin/)
})
