import { test, before, after, beforeEach } from "node:test"
import assert from "node:assert/strict"
import { deployToVercel, isVercelConfigured } from "../../services/integrations/vercel"

/* Мокаем global.fetch — реальных деплоев на Vercel эти тесты не создают. */

const originalFetch = global.fetch
const originalToken = process.env.VERCEL_TOKEN

let createCalls = 0

function installFakeFetch() {
  createCalls = 0
  global.fetch = (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET"

    if (method === "POST" && url.includes("/v13/deployments") && !url.includes("/v13/deployments/dep_")) {
      createCalls++
      return new Response(JSON.stringify({ id: "dep_123", url: "app-abc123.vercel.app", readyState: "QUEUED" }), {
        status: 200,
      })
    }

    if (method === "GET" && url.includes("/v13/deployments/dep_123")) {
      return new Response(JSON.stringify({ id: "dep_123", url: "app-abc123.vercel.app", readyState: "READY" }), {
        status: 200,
      })
    }

    return new Response("not found", { status: 404 })
  }) as typeof fetch
}

before(() => {
  process.env.VERCEL_TOKEN = "test-token"
})

after(() => {
  global.fetch = originalFetch
  if (originalToken === undefined) delete process.env.VERCEL_TOKEN
  else process.env.VERCEL_TOKEN = originalToken
})

beforeEach(() => {
  installFakeFetch()
})

test("isVercelConfigured: true только при заданном VERCEL_TOKEN", () => {
  assert.equal(isVercelConfigured(), true)
  delete process.env.VERCEL_TOKEN
  assert.equal(isVercelConfigured(), false)
  process.env.VERCEL_TOKEN = "test-token"
})

test("deployToVercel: без файлов бросает ошибку без обращения к сети", async () => {
  await assert.rejects(() => deployToVercel([], "empty-project"), /Нет файлов для деплоя/)
  assert.equal(createCalls, 0)
})

test("deployToVercel: успешный деплой возвращает https-URL из readyState READY", async () => {
  const files = [{ path: "package.json", content: JSON.stringify({ name: "a" }) }]
  const url = await deployToVercel(files, "vercel-test-project-1")
  assert.equal(url, "https://app-abc123.vercel.app")
  assert.equal(createCalls, 1)
})

test("deployToVercel: повторный вызов с теми же файлами использует кеш (не создаёт новый деплой)", async () => {
  const files = [{ path: "package.json", content: JSON.stringify({ name: "b" }) }]
  const first = await deployToVercel(files, "vercel-test-project-2")
  const second = await deployToVercel(files, "vercel-test-project-2")
  assert.equal(first, second)
  assert.equal(createCalls, 1, "второй вызов должен быть отдан из кеша, без нового запроса на создание деплоя")
})

test("deployToVercel: force=true игнорирует кеш и создаёт новый деплой", async () => {
  const files = [{ path: "package.json", content: JSON.stringify({ name: "c" }) }]
  await deployToVercel(files, "vercel-test-project-3")
  await deployToVercel(files, "vercel-test-project-3", { force: true })
  assert.equal(createCalls, 2)
})
