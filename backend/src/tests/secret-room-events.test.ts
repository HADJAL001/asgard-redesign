import { after, before, test } from "node:test"
import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

const PORT = 4992
const BASE = `http://127.0.0.1:${PORT}`
const ROOT = path.resolve(__dirname, "../..")
const DB_RELATIVE = "./data/test-secret-room-events.db"
const DB_PATH = path.resolve(ROOT, DB_RELATIVE)
const tsxCli = require.resolve("tsx/cli")
let server: ChildProcess
let sequence = 0

function removeDatabase() { for (const suffix of ["", "-wal", "-shm"]) if (fs.existsSync(DB_PATH + suffix)) fs.rmSync(DB_PATH + suffix, { force: true }) }
function run(script: string) { return new Promise<void>((resolve, reject) => { const child = spawn(process.execPath, [tsxCli, script], { cwd: ROOT, env: { ...process.env, DB_PATH: DB_RELATIVE, NODE_ENV: "test" }, stdio: "ignore" }); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`init failed: ${code}`))) }) }
async function waitForHealth() { const until = Date.now() + 30_000; while (Date.now() < until) { try { if ((await fetch(`${BASE}/health`)).ok) return } catch {} await new Promise(resolve => setTimeout(resolve, 150)) }; throw new Error("server did not start") }
async function register(prefix: string) { const username = `${prefix}${++sequence}`; const response = await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, email: `${username}@test.local`, password: "TestPass123!" }) }); assert.equal(response.status, 201); return await response.json() as { token: string; user: { id: number } } }
const auth = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" })

before(async () => { removeDatabase(); await run("src/scripts/init-db.ts"); server = spawn(process.execPath, [tsxCli, "src/server.ts"], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DB_PATH: DB_RELATIVE, NODE_ENV: "test" }, stdio: "ignore" }); await waitForHealth() })
after(async () => { server?.kill(); await new Promise(resolve => setTimeout(resolve, 250)); removeDatabase() })

test("Secret Room event booking is member-only, capacity-bound, and transfers TimeCoin once", async () => {
  const owner = await register("roomowner"), member = await register("roommember"), outsider = await register("roomoutsider")
  const db = new Database(DB_PATH)
  const now = Date.now()
  const roomId = Number(db.prepare(`INSERT INTO secret_rooms (owner_id, name, background, items, friend_slots, access_until, created_at, updated_at) VALUES (?, 'Room', 'nebula', '[]', 3, ?, ?, ?)`).run(owner.user.id, now + 86_400_000, now, now).lastInsertRowid)
  db.prepare(`INSERT INTO secret_room_members (room_id, user_id, added_at) VALUES (?, ?, ?)`).run(roomId, member.user.id, now)
  db.prepare(`UPDATE wallets SET timecoin = 20 WHERE user_id = ?`).run(member.user.id)
  const create = await fetch(`${BASE}/secret-room/events`, { method: "POST", headers: auth(owner.token), body: JSON.stringify({ title: "Private build", startsAt: now + 3_600_000, capacity: 1, priceTimecoin: 7 }) })
  assert.equal(create.status, 201)
  const { event } = await create.json() as { event: { id: number } }
  const denied = await fetch(`${BASE}/secret-room/events/${event.id}/book`, { method: "POST", headers: auth(outsider.token), body: "{}" })
  assert.equal(denied.status, 403)
  const booked = await fetch(`${BASE}/secret-room/events/${event.id}/book`, { method: "POST", headers: auth(member.token), body: "{}" })
  assert.equal(booked.status, 201)
  const duplicate = await fetch(`${BASE}/secret-room/events/${event.id}/book`, { method: "POST", headers: auth(member.token), body: "{}" })
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json() as any).duplicate, true)
  assert.equal((db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(member.user.id) as any).timecoin, 13)
  assert.equal((db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(owner.user.id) as any).timecoin, 7)
  assert.equal((db.prepare(`SELECT COUNT(*) AS count FROM secret_room_event_attendees WHERE event_id = ?`).get(event.id) as any).count, 1)
  const activity = await fetch(`${BASE}/secret-room/activity`, { headers: auth(member.token) })
  assert.equal(activity.status, 200)
  const items = (await activity.json() as { activity: Array<{ kind: string }> }).activity
  assert.ok(items.some((item) => item.kind === "event_created"))
  assert.ok(items.some((item) => item.kind === "event_booked"))
  db.close()
})

test("Secret Room creator line is member-only and opens a direct conversation with the team", async () => {
  const creator = await register("roomcreator"), member = await register("lineMember"), outsider = await register("lineOutsider")
  const db = new Database(DB_PATH)
  const now = Date.now()
  db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(creator.user.id)
  const roomId = Number(db.prepare(`INSERT INTO secret_rooms (owner_id, name, background, items, friend_slots, access_until, created_at, updated_at) VALUES (?, 'Line', 'nebula', '[]', 3, ?, ?, ?)`).run(creator.user.id, now + 86_400_000, now, now).lastInsertRowid)
  db.prepare(`INSERT INTO secret_room_members (room_id, user_id, added_at) VALUES (?, ?, ?)`).run(roomId, member.user.id, now)

  const forbidden = await fetch(`${BASE}/secret-room/creator-line`, { method: "POST", headers: auth(outsider.token), body: JSON.stringify({ text: "Can anyone help?" }) })
  assert.equal(forbidden.status, 403)
  const sent = await fetch(`${BASE}/secret-room/creator-line`, { method: "POST", headers: auth(member.token), body: JSON.stringify({ text: "Need feedback on my launch." }) })
  assert.equal(sent.status, 201)
  assert.equal((await sent.json() as any).creator.userId, creator.user.id)
  assert.deepEqual(db.prepare(`SELECT sender_id, recipient_id, body FROM direct_messages ORDER BY id DESC LIMIT 1`).get(), { sender_id: member.user.id, recipient_id: creator.user.id, body: "Need feedback on my launch." })
  db.close()
})

test("Secret Room stores only self-contained compact glTF avatars", async () => {
  const owner = await register("avatarowner")
  const db = new Database(DB_PATH)
  const now = Date.now()
  db.prepare(`INSERT INTO secret_rooms (owner_id, name, background, items, friend_slots, access_until, created_at, updated_at) VALUES (?, 'Avatar', 'nebula', '[]', 3, ?, ?, ?)`).run(owner.user.id, now + 86_400_000, now, now)
  const avatar = JSON.stringify({ asset: { version: "2.0" }, scenes: [{ nodes: [] }], nodes: [] })
  const saved = await fetch(`${BASE}/secret-room`, { method: "PATCH", headers: auth(owner.token), body: JSON.stringify({ avatarGltf: avatar }) })
  assert.equal(saved.status, 200)
  assert.equal((await saved.json() as any).room.avatarGltf, avatar)
  const rejected = await fetch(`${BASE}/secret-room`, { method: "PATCH", headers: auth(owner.token), body: JSON.stringify({ avatarGltf: JSON.stringify({ asset: { version: "2.0" }, scenes: [], nodes: [], buffers: [{ byteLength: 1, uri: "https://example.test/model.bin" }] }) }) })
  assert.equal(rejected.status, 400)
  db.close()
})
