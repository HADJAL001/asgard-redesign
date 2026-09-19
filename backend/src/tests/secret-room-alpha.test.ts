import assert from "node:assert/strict"
import test from "node:test"
import db from "../lib/db"
import { UserModel } from "../models/user.model"

test("Secret Room alpha access requires both an active member room and a published release", async () => {
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
