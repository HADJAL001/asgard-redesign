import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const PORT = 4991
const BASE = `http://127.0.0.1:${PORT}`
const ROOT = path.resolve(__dirname, "../..")
const DB_RELATIVE = "./data/test-direct-messages.db"
const DB_PATH = path.resolve(ROOT, DB_RELATIVE)
const tsxCli = require.resolve("tsx/cli")
let server: ChildProcess
let userSequence = 0

async function removeDatabase() {
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = DB_PATH + suffix
    if (fs.existsSync(file)) fs.rmSync(file, { force: true })
  }
}

function run(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, script], {
      cwd: ROOT,
      env: { ...process.env, DB_PATH: DB_RELATIVE, NODE_ENV: "test" },
      stdio: "ignore",
    })
    child.once("error", reject)
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code}`)))
  })
}

async function waitForHealth() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return
    } catch {
      // The isolated server is still running startup migrations.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error("direct messages test server did not become healthy")
}

async function register(prefix: string) {
  userSequence += 1
  const username = `${prefix}${userSequence}`
  const response = await fetch(`${BASE}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, email: `${username}@test.local`, password: "TestPass123!" }),
  })
  assert.equal(response.status, 201)
  return await response.json() as { token: string; user: { id: number } }
}

function auth(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" }
}

before(async () => {
  await removeDatabase()
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
  await new Promise((resolve) => setTimeout(resolve, 300))
  await removeDatabase()
})

test("direct messages preserve ownership, unread state, and reject self-send", async () => {
  const alice = await register("messagealice")
  const bob = await register("messagebob")
  const charlie = await register("messagecharlie")

  const unauthenticated = await fetch(`${BASE}/messages`)
  assert.equal(unauthenticated.status, 401)

  const selfSend = await fetch(`${BASE}/messages/${alice.user.id}`, {
    method: "POST", headers: auth(alice.token), body: JSON.stringify({ text: "nope" }),
  })
  assert.equal(selfSend.status, 400)

  const recommendations = await fetch(`${BASE}/messages/recommended`, { headers: auth(alice.token) })
  const recommendationsBody = await recommendations.json() as { users: Array<{ id: number }> }
  assert.equal(recommendations.status, 200)
  assert.ok(recommendationsBody.users.some((user) => user.id === bob.user.id))
  assert.ok(recommendationsBody.users.some((user) => user.id === charlie.user.id))
  assert.ok(!recommendationsBody.users.some((user) => user.id === alice.user.id))

  const sent = await fetch(`${BASE}/messages/${bob.user.id}`, {
    method: "POST", headers: auth(alice.token), body: JSON.stringify({ text: "Hello, Bob" }),
  })
  assert.equal(sent.status, 201)

  const recommendationsAfterMessage = await fetch(`${BASE}/messages/recommended`, { headers: auth(alice.token) })
  const recommendationsAfterMessageBody = await recommendationsAfterMessage.json() as { users: Array<{ id: number }> }
  assert.ok(!recommendationsAfterMessageBody.users.some((user) => user.id === bob.user.id))

  const inbox = await fetch(`${BASE}/messages`, { headers: auth(bob.token) })
  const inboxBody = await inbox.json() as { conversations: Array<{ user: { id: number }; unreadCount: number; lastMessage: { text: string } }> }
  assert.equal(inbox.status, 200)
  assert.equal(inboxBody.conversations.length, 1)
  assert.equal(inboxBody.conversations[0].user.id, alice.user.id)
  assert.equal(inboxBody.conversations[0].unreadCount, 1)
  assert.equal(inboxBody.conversations[0].lastMessage.text, "Hello, Bob")

  const foreign = await fetch(`${BASE}/messages/${alice.user.id}`, { headers: auth(charlie.token) })
  const foreignBody = await foreign.json() as { messages: unknown[] }
  assert.equal(foreign.status, 200)
  assert.deepEqual(foreignBody.messages, [])

  const thread = await fetch(`${BASE}/messages/${alice.user.id}`, { headers: auth(bob.token) })
  const threadBody = await thread.json() as { messages: Array<{ text: string; mine: boolean }> }
  assert.equal(thread.status, 200)
  assert.equal(threadBody.messages.length, 1)
  assert.equal(threadBody.messages[0].text, "Hello, Bob")
  assert.equal(threadBody.messages[0].mine, false)

  const readInbox = await fetch(`${BASE}/messages`, { headers: auth(bob.token) })
  const readBody = await readInbox.json() as { conversations: Array<{ unreadCount: number }> }
  assert.equal(readBody.conversations[0].unreadCount, 0)
})
