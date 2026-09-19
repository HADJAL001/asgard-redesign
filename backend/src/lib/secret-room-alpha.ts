import db from "./db"
import { hasActiveSecretRoom } from "./secret-room-perks"

export type AlphaRelease = { version: string; notes: string; publishedAt: number }

export function getAlphaRelease(): AlphaRelease | null {
  const row = db.prepare(`SELECT version, notes, published_at AS publishedAt FROM secret_room_alpha_releases WHERE id = 1`).get() as AlphaRelease | undefined
  return row || null
}

export function getAlphaAccess(userId: number) {
  const release = getAlphaRelease()
  const member = hasActiveSecretRoom(userId)
  return { entitled: member && !!release, member, release }
}

export function publishAlphaRelease(version: string, notes = ""): AlphaRelease {
  const normalizedVersion = version.trim().slice(0, 80)
  if (!normalizedVersion) throw new Error("Alpha release version is required")
  const now = Date.now()
  db.prepare(`
    INSERT INTO secret_room_alpha_releases (id, version, notes, published_at, updated_at)
    VALUES (1, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET version = excluded.version, notes = excluded.notes, published_at = excluded.published_at, updated_at = excluded.updated_at
  `).run(normalizedVersion, notes.trim().slice(0, 500), now, now)
  return getAlphaRelease()!
}
