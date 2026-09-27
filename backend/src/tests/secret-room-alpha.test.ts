import assert from "node:assert/strict"
import test from "node:test"
import db from "../lib/db"
import { UserModel } from "../models/user.model"

test("Secret Room alpha access requires both an active member room and a published release", async () => {
  // This test is intentionally standalone; provide the minimal user table
  // expected by UserModel instead of depending on the global test order.
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    password_hash TEXT,
    phone TEXT,
    ip_address TEXT,
    referral_code TEXT,
    referred_by INTEGER,
    is_verified INTEGER DEFAULT 0,
    twofa_secret TEXT,
    twofa_enabled INTEGER DEFAULT 0,
    nonce INTEGER DEFAULT 0,
    role TEXT DEFAULT 'user',
    created_at INTEGER,
    updated_at INTEGER
  )`)
  // Alpha entitlement depends on the base Secret Room schema; keep this test
  // independently runnable instead of relying on another test's import order.
  await import("../migrations/070_secret_room")
  await import("../migrations/124_secret_room_alpha")
  const { getAlphaAccess, publishAlphaRelease } = await import("../lib/secret-room-alpha")
  const userId = UserModel.create({ username: `alpha_test_${Date.now()}`, email: null, password_hash: null })
  db.prepare(`DELETE FROM secret_room_alpha_releases WHERE id = 1`).run()

  const beforeRelease = getAlphaAccess(userId)
  assert.equal(beforeRelease.entitled, false)
  assert.equal(beforeRelease.release, null)
  const release = publishAlphaRelease("OSGARD 5.0 Alpha", "Early member preview")
  assert.equal(release.version, "OSGARD 5.0 Alpha")
  assert.equal(getAlphaAccess(userId).entitled, beforeRelease.member)

  const now = Date.now()
  db.prepare(`INSERT INTO secret_rooms (owner_id, name, background, items, friend_slots, access_until, created_at, updated_at) VALUES (?, 'Test', 'nebula', '[]', 3, ?, ?, ?)`)
    .run(userId, now + 86_400_000, now, now)
  const access = getAlphaAccess(userId)
  assert.equal(access.member, true)
  assert.equal(access.entitled, true)
  db.prepare(`DELETE FROM secret_rooms WHERE owner_id = ?`).run(userId)
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)
  db.prepare(`DELETE FROM secret_room_alpha_releases WHERE id = 1`).run()
})
