import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { notificationEvents, getUnreadCount } from "../lib/notifications"

const router = Router()

const PAGE_SIZE = 50

/** Счётчик активных SSE-подключений — для /health и диагностики нагрузки. */
export let activeNotificationSseConnections = 0

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

/* ================================================================
   GET /notifications/stream — SSE-поток уведомлений текущего пользователя.
   ----------------------------------------------------------------
   При подключении сразу отдаём снапшот (текущий счётчик непрочитанных),
   затем проталкиваем каждое новое уведомление этого пользователя в
   реальном времени (createNotification → notificationEvents "notify").
   Клиент (lib/store/notifications-store) инкрементит бейдж и добавляет
   уведомление в список без опроса. Heartbeat раз в 15с держит соединение.
   ================================================================ */
router.get("/stream", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  const send = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  // Снапшот при подключении — чтобы бейдж синхронизировался мгновенно, ещё до первого события.
  send({ type: "snapshot", unreadCount: getUnreadCount(userId) })

  const onNotify = (payload: { userId: number; notification: unknown; unreadCount: number }) => {
    // Доставляем только уведомления этого пользователя (шина общая на всех).
    if (payload.userId !== userId) return
    send({ type: "notification", notification: payload.notification, unreadCount: payload.unreadCount })
  }

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
  const cleanup = () => {
    clearInterval(heartbeat)
    notificationEvents.off("notify", onNotify)
    activeNotificationSseConnections--
  }

  activeNotificationSseConnections++
  notificationEvents.on("notify", onNotify)
  req.on("close", cleanup)
})

export default router
