import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

const router = Router()

const PAGE_SIZE = 50

type ActorRow = {
  id: number
  username: string
  display_name: string | null
  avatar_url: string | null
}

function mapActor(row: ActorRow | null) {
  if (!row) return null
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
  }
}

/* ---------------- GET /notifications ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const rows = db
    .prepare(
      `SELECT n.id, n.type, n.entity_type, n.entity_id, n.text, n.read, n.created_at,
              a.id as actor_id, a.username as actor_username, a.display_name as actor_display_name, a.avatar_url as actor_avatar_url
       FROM notifications n
       LEFT JOIN users a ON a.id = n.actor_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ?`,
    )
    .all(userId, PAGE_SIZE) as any[]

  const notifications = rows.map((r) => ({
    id: r.id,
    type: r.type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    text: r.text,
    read: !!r.read,
    createdAt: r.created_at,
    actor: mapActor(
      r.actor_id
        ? { id: r.actor_id, username: r.actor_username, display_name: r.actor_display_name, avatar_url: r.actor_avatar_url }
        : null,
    ),
  }))

  res.json({ success: true, notifications })
})

/* ---------------- GET /notifications/unread-count ---------------- */
router.get("/unread-count", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const { c } = db
    .prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0`)
    .get(userId) as { c: number }

  res.json({ success: true, unreadCount: c })
})

/* ---------------- POST /notifications/:id/read ---------------- */
router.post("/:id/read", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Некорректный ID уведомления" })
  }

  db.prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?`).run(id, userId)
  res.json({ success: true })
})

/* ---------------- POST /notifications/read-all ---------------- */
router.post("/read-all", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0`).run(userId)
  res.json({ success: true })
})

export default router
