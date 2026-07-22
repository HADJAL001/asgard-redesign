import db from "../lib/db"

/* ================================================================
   OSGARD · E2E-проверка REST/SSE роутов оркестратора
   ----------------------------------------------------------------
   Бьёт по РЕАЛЬНОМУ запущенному серверу (fetch, без supertest —
   в проекте нет тестового фреймворка, ai-router.ts уже строится
   на fetch, так что это не новая зависимость). Требует:
     npx tsx watch src/server.ts   (в отдельном терминале)
   Запуск:
     npx tsx src/scripts/test-orchestrator-e2e.ts
   ================================================================ */

const BASE_URL = process.env.ORCH_TEST_BASE_URL || "http://localhost:3002"

let failed = false
function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`✅ ${label}`)
  } else {
    failed = true
    console.error(`❌ ${label}`)
  }
}

async function api(path: string, opts: { method?: string; token?: string; body?: any } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
  const text = await res.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* не JSON-ответ (например SSE) — вызывающий код сам разберётся */
  }
  return { status: res.status, json, text }
}

async function registerUser(label: string): Promise<{ userId: number; token: string; username: string }> {
  const username = `orch${label}${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.slice(0, 20)
  const { status, json } = await api("/auth/register", {
    method: "POST",
    body: { username, password: "TestPass123", email: `${username}@orch-e2e.test` },
  })
  if (status !== 201 || !json?.token) {
    throw new Error(`registerUser(${label}) failed: status=${status} body=${JSON.stringify(json)}`)
  }
  return { userId: json.user.id, token: json.token, username }
}

function setTimecoin(userId: number, amount: number) {
  db.prepare(`UPDATE wallets SET timecoin = ? WHERE user_id = ?`).run(amount, userId)
}

function cleanupUser(userId: number) {
  db.prepare(`DELETE FROM orchestrator_executions WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM orchestrator_chains WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM wallets WHERE user_id = ?`).run(userId)
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
}

function linearChainPayload(name: string) {
  return {
    name,
    nodes: [
      { id: "n1", data: { type: "prompt_template", template: "Hello {{input}}!" } },
      { id: "n2", data: { type: "prompt_template", template: "[[{{input}}]]" } },
      { id: "n3", data: { type: "prompt_template", template: "<<{{input}}>>" } },
    ],
    edges: [
      { source: "n1", target: "n2" },
      { source: "n2", target: "n3" },
    ],
  }
}

function cyclicChainPayload(name: string) {
  return {
    name,
    nodes: [
      { id: "a", data: { type: "prompt_template", template: "{{input}}" } },
      { id: "b", data: { type: "prompt_template", template: "{{input}}" } },
    ],
    edges: [
      { source: "a", target: "b" },
      { source: "b", target: "a" },
    ],
  }
}

async function waitForHealth() {
  try {
    const { status } = await api("/health")
    assert(status === 200, `сервер отвечает на GET /health (${BASE_URL})`)
  } catch (err) {
    console.error(`❌ Сервер недоступен по ${BASE_URL}. Запусти backend (npx tsx watch src/server.ts) и повтори.`)
    throw err
  }
}

async function pollExecution(token: string, executionId: number, timeoutMs = 10_000): Promise<any> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { json } = await api(`/orchestrator/executions/${executionId}`, { token })
    if (json?.execution?.status === "success" || json?.execution?.status === "error") {
      return json.execution
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`execution ${executionId} не завершилась за ${timeoutMs}мс`)
}

/** Читает SSE-поток до события chain_done/chain_error, возвращает список типов событий. */
async function consumeSse(token: string, executionId: number, timeoutMs = 10_000): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const res = await fetch(`${BASE_URL}/orchestrator/stream/${executionId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  })

  const events: string[] = []
  const reader = res.body?.getReader()
  if (!reader) {
    clearTimeout(timer)
    return events
  }
  const decoder = new TextDecoder()
  let buf = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split("\n\n")
      buf = lines.pop() ?? ""
      for (const line of lines) {
        const dataLine = line.split("\n").find((l) => l.startsWith("data: "))
        if (!dataLine) continue
        const payload = JSON.parse(dataLine.slice("data: ".length))
        events.push(payload.type)
        if (payload.type === "chain_done" || payload.type === "chain_error") {
          clearTimeout(timer)
          await reader.cancel()
          return events
        }
      }
    }
  } catch (err: any) {
    if (err.name !== "AbortError") throw err
  } finally {
    clearTimeout(timer)
  }
  return events
}

async function main() {
  await waitForHealth()

  const owner = await registerUser("owner")
  const stranger = await registerUser("stranger")

  try {
    // --- Авторизация обязательна ---
    {
      const { status } = await api("/orchestrator/chains")
      assert(status === 401, "GET /orchestrator/chains без токена -> 401")
    }

    // --- Валидация графа: цикл отклоняется при создании ---
    {
      const { status, json } = await api("/orchestrator/chains", {
        method: "POST",
        token: owner.token,
        body: cyclicChainPayload("Cyclic"),
      })
      assert(status === 400 && /цикл/i.test(json?.error ?? ""), `POST с циклическим графом -> 400 (${json?.error})`)
    }

    // --- Создание валидной цепочки ---
    let chainId: number
    {
      const { status, json } = await api("/orchestrator/chains", {
        method: "POST",
        token: owner.token,
        body: linearChainPayload("E2E Snake"),
      })
      assert(status === 201 && json?.chain?.id > 0, "POST /orchestrator/chains создаёт цепочку -> 201")
      chainId = json.chain.id
    }

    // --- Список и получение по id ---
    {
      const { status, json } = await api("/orchestrator/chains", { token: owner.token })
      assert(status === 200 && json.chains.some((c: any) => c.id === chainId), "GET /orchestrator/chains содержит созданную цепочку")
    }
    {
      const { status, json } = await api(`/orchestrator/chains/${chainId}`, { token: owner.token })
      assert(status === 200 && json.chain.id === chainId, "GET /orchestrator/chains/:id возвращает цепочку владельца")
    }

    // --- Изоляция между пользователями ---
    {
      const { status } = await api(`/orchestrator/chains/${chainId}`, { token: stranger.token })
      assert(status === 404, "GET чужой цепочки чужим токеном -> 404 (изоляция по user_id)")
    }
    {
      const { status } = await api(`/orchestrator/chains/${chainId}`, {
        method: "PUT",
        token: stranger.token,
        body: linearChainPayload("Hijack attempt"),
      })
      assert(status === 404, "PUT чужой цепочки чужим токеном -> 404")
    }

    // --- Обновление цепочки владельцем ---
    {
      const { status, json } = await api(`/orchestrator/chains/${chainId}`, {
        method: "PUT",
        token: owner.token,
        body: linearChainPayload("E2E Snake Renamed"),
      })
      assert(status === 200 && json.chain.name === "E2E Snake Renamed", "PUT владельцем переименовывает цепочку")
    }

    // --- Запуск: недостаточно TimeCoin (платный узел, баланс 0) ---
    {
      const { status, json } = await api("/orchestrator/chains", {
        method: "POST",
        token: owner.token,
        body: {
          name: "Paid chain",
          nodes: [{ id: "p1", data: { type: "deepseek" } }],
          edges: [],
        },
      })
      assert(status === 201, "создана платная цепочка (1 узел deepseek, cost=1TC)")
      const paidChainId = json.chain.id

      setTimecoin(owner.userId, 0)
      const run = await api(`/orchestrator/chains/${paidChainId}/run`, {
        method: "POST",
        token: owner.token,
        body: { input: "test" },
      })
      assert(run.status === 400 && /TimeCoin/i.test(run.json?.error ?? ""), `запуск без TC -> 400 (${run.json?.error})`)

      db.prepare(`DELETE FROM orchestrator_chains WHERE id = ?`).run(paidChainId)
    }

    // --- Запуск бесплатной цепочки (prompt_template, cost=0) + опрос статуса ---
    let executionId: number
    {
      setTimecoin(owner.userId, 100)
      const run = await api(`/orchestrator/chains/${chainId}/run`, {
        method: "POST",
        token: owner.token,
        body: { input: "World" },
      })
      assert(run.status === 202 && run.json?.cost === 0 && run.json?.executionId > 0, `запуск бесплатной цепочки -> 202 (${JSON.stringify(run.json)})`)
      executionId = run.json.executionId
    }
    {
      const execution = await pollExecution(owner.token, executionId)
      assert(execution.status === "success", `запуск завершился успешно (status=${execution.status})`)
      assert(execution.output === "<<[[Hello World!]]>>", `итоговый output корректный: "${execution.output}"`)
      assert(Array.isArray(execution.node_statuses) && execution.node_statuses.every((n: any) => n.status === "done"), "все узлы отмечены done в node_statuses")
    }

    // --- SSE-поток для уже завершённого запуска отдаёт финальное событие сразу ---
    {
      const events = await consumeSse(owner.token, executionId)
      assert(events.includes("chain_done"), `SSE по завершённому запуску сразу отдаёт chain_done (события: ${events.join(",")})`)
    }

    // --- SSE-поток для второго запуска: т.к. цепочка из prompt_template выполняется
    //     практически мгновенно, гонка между fire-and-forget executeChain() и подключением
    //     к SSE недетерминирована — роут либо проигрывает node_start/node_done по мере
    //     выполнения, либо (если execution уже success к моменту коннекта) сразу отдаёт
    //     единственное терминальное событие. Проверяем инвариант, гарантированный в обоих
    //     случаях: поток всегда заканчивается ровно на chain_done, без "оборванных" событий.
    {
      const run = await api(`/orchestrator/chains/${chainId}/run`, {
        method: "POST",
        token: owner.token,
        body: { input: "Live" },
      })
      assert(run.status === 202, "второй запуск для live-SSE проверки -> 202")
      const events = await consumeSse(owner.token, run.json.executionId)
      assert(events.length > 0 && events[events.length - 1] === "chain_done", `SSE-поток второго запуска корректно завершается на chain_done (события: ${events.join(",")})`)
    }

    // --- Чужой доступ к execution ---
    {
      const { status } = await api(`/orchestrator/executions/${executionId}`, { token: stranger.token })
      assert(status === 404, "GET чужого execution чужим токеном -> 404")
    }

    // --- Удаление ---
    {
      const del = await api(`/orchestrator/chains/${chainId}`, { method: "DELETE", token: owner.token })
      assert(del.status === 200, "DELETE владельцем -> 200")
      const after = await api(`/orchestrator/chains/${chainId}`, { token: owner.token })
      assert(after.status === 404, "цепочка недоступна после удаления -> 404")
    }
  } finally {
    cleanupUser(owner.userId)
    cleanupUser(stranger.userId)
  }

  if (failed) {
    console.error("\n❌ E2E-проверка оркестратора провалена")
    process.exit(1)
  }
  console.log("\n✅ Все E2E-проверки оркестратора пройдены")
}

main().catch((err) => {
  console.error("❌ Неперехваченная ошибка E2E-теста:", err)
  process.exit(1)
})
