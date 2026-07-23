import { Router } from "express"
import db from "../lib/db"

const router = Router()

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type ActorRow = {
  id: number
  username: string
  display_name: string | null
  avatar_url: string | null
}

function mapActor(row: ActorRow) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
  }
}

/* ---------------- GET /feed ---------------- */
router.get("/", (req, res) => {
  const before = Number(req.query.before)
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  const hasCursor = Number.isInteger(before) && before > 0

  const rows = db
    .prepare(
      `SELECT e.id, e.type, e.entity_type, e.entity_id, e.text, e.metadata, e.created_at,
              u.id as actor_id, u.username as actor_username, u.display_name as actor_display_name, u.avatar_url as actor_avatar_url
       FROM activity_events e
       JOIN users u ON u.id = e.user_id
       ${hasCursor ? "WHERE e.id < ?" : ""}
       ORDER BY e.id DESC
       LIMIT ?`,
    )
    .all(...(hasCursor ? [before, limit] : [limit])) as any[]

  const events = rows.map((r) => ({
    id: r.id,
    type: r.type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    text: r.text,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.created_at,
    actor: mapActor({
      id: r.actor_id,
      username: r.actor_username,
      display_name: r.actor_display_name,
      avatar_url: r.actor_avatar_url,
    }),
  }))

  const nextCursor = events.length === limit ? events[events.length - 1].id : null

  res.json({ success: true, events, nextCursor })
})

export default router
