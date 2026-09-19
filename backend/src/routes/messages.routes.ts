import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { rateLimit } from "../middleware/rateLimiter"
import { createNotification } from "../lib/notifications"

const router = Router()
const MAX_BODY_LENGTH = 2_000
const PAGE_SIZE = 100
const SEARCH_PAGE_SIZE = 20

type UserRow = { id: number; username: string; display_name: string | null; avatar_url: string | null }

function mapUser(row: UserRow) {
  return { id: row.id, username: row.username, displayName: row.display_name || row.username, avatarUrl: row.avatar_url || null }
}

function getRecipient(id: number): UserRow | undefined {
  return db.prepare(`SELECT id, username, display_name, avatar_url FROM users WHERE id = ? AND COALESCE(banned, 0) = 0`).get(id) as UserRow | undefined
}

router.get("/", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rows = db.prepare(`
    WITH mine AS (
      SELECT m.*, CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END AS partner_id
      FROM direct_messages m WHERE m.sender_id = ? OR m.recipient_id = ?
    ), latest AS (
      SELECT partner_id, MAX(id) AS message_id FROM mine GROUP BY partner_id
    )
    SELECT m.id, m.body, m.created_at, m.sender_id, m.recipient_id, m.partner_id,
           u.username, u.display_name, u.avatar_url,
           (SELECT COUNT(*) FROM direct_messages unread WHERE unread.sender_id = m.partner_id AND unread.recipient_id = ? AND unread.read_at IS NULL) AS unread_count
    FROM mine m
    JOIN latest l ON l.message_id = m.id
    JOIN users u ON u.id = m.partner_id
    WHERE COALESCE(u.banned, 0) = 0
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT 100
  `).all(userId, userId, userId, userId) as Array<any>

  res.json({ conversations: rows.map((row) => ({
    user: mapUser(row),
    lastMessage: { id: row.id, text: row.body, createdAt: row.created_at, mine: row.sender_id === userId },
    unreadCount: row.unread_count,
  })) })
})

router.get("/users", requireAuth, rateLimit(60_000, 30), (req: AuthRequest, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : ""
  if (query.length < 2) return res.json({ users: [] })
  const escaped = query.replace(/[\\%_]/g, "\\$&")
  const rows = db.prepare(`
    SELECT id, username, display_name, avatar_url FROM users
    WHERE id <> ? AND COALESCE(banned, 0) = 0
      AND (username LIKE ? ESCAPE '\\' OR COALESCE(display_name, '') LIKE ? ESCAPE '\\')
    ORDER BY username COLLATE NOCASE ASC LIMIT ?
  `).all(req.user!.userId, `%${escaped}%`, `%${escaped}%`, SEARCH_PAGE_SIZE) as UserRow[]
  res.json({ users: rows.map(mapUser) })
})

router.get("/:userId", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const recipientId = Number(req.params.userId)
  if (!Number.isInteger(recipientId) || recipientId <= 0 || recipientId === userId) return res.status(400).json({ error: "Некорректный получатель" })
  const recipient = getRecipient(recipientId)
  if (!recipient) return res.status(404).json({ error: "Пользователь не найден" })

  const now = Date.now()
  db.prepare(`UPDATE direct_messages SET read_at = ? WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL`).run(now, recipientId, userId)
  const messages = db.prepare(`
    SELECT id, sender_id, body, created_at, read_at FROM direct_messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY id DESC LIMIT ?
  `).all(userId, recipientId, recipientId, userId, PAGE_SIZE) as Array<any>
  res.json({ user: mapUser(recipient), messages: messages.reverse().map((row) => ({ id: row.id, text: row.body, createdAt: row.created_at, mine: row.sender_id === userId, readAt: row.read_at })) })
})

router.post("/:userId", requireAuth, rateLimit(60_000, 30, (req) => `message:${(req as AuthRequest).user?.userId ?? req.ip}`), (req: AuthRequest, res) => {
  const senderId = req.user!.userId
  const recipientId = Number(req.params.userId)
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : ""
  if (!Number.isInteger(recipientId) || recipientId <= 0 || recipientId === senderId) return res.status(400).json({ error: "Некорректный получатель" })
  if (!text || text.length > MAX_BODY_LENGTH) return res.status(400).json({ error: `Сообщение должно содержать от 1 до ${MAX_BODY_LENGTH} символов` })
  const recipient = getRecipient(recipientId)
  if (!recipient) return res.status(404).json({ error: "Пользователь не найден" })

  const createdAt = Date.now()
  const result = db.prepare(`INSERT INTO direct_messages (sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?)`).run(senderId, recipientId, text, createdAt)
  createNotification({ userId: recipientId, actorId: senderId, type: "message", entityType: "direct_message", entityId: Number(result.lastInsertRowid), text: "Новое личное сообщение" })
  res.status(201).json({ message: { id: Number(result.lastInsertRowid), text, createdAt, mine: true, readAt: null } })
})

export default router
