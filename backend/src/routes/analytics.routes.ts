import { Router } from "express"
import db from "../lib/db"
import { optionalAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { rateLimit } from "../middleware/rateLimiter"

const router = Router()

/* Белый список защищает таблицу от произвольного мусора с публичной ручки без авторизации.
   Источники: paywall/pricing-воронка (AdminController.paywallFunnel) + виральная петля
   share (artifact_share_click — намерение поделиться, замыкает K-фактор в growth-ридере
   вместе с серверным artifact_share_view #46). Никаких других событий с публичной ручки. */
const ALLOWED_EVENTS = new Set([
  "pricing_view",
  "pricing_click",
  "pricing_conversion",
  "pricing_abandon",
  "artifact_share_click",
])

const MAX_META_JSON_LENGTH = 2000

/* ---------------- POST /analytics/event ---------------- */
router.post("/event", rateLimit(60_000, 60), optionalAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { session_id, event_name, meta } = req.body || {}

  if (!session_id || typeof session_id !== "string" || session_id.length > 100) {
    return res.status(400).json({ error: "Некорректный session_id" })
  }
  if (!event_name || typeof event_name !== "string" || !ALLOWED_EVENTS.has(event_name)) {
    return res.status(400).json({ error: "Неизвестное событие" })
  }

  let metaJson: string | null = null
  if (meta !== undefined && meta !== null) {
    if (typeof meta !== "object" || Array.isArray(meta)) {
      return res.status(400).json({ error: "meta должен быть объектом" })
    }
    metaJson = JSON.stringify(meta)
    if (metaJson.length > MAX_META_JSON_LENGTH) {
      return res.status(400).json({ error: "meta слишком большой" })
    }
  }

  const userId = req.user?.userId ?? null

  db.prepare(
    `INSERT INTO analytics_events (user_id, session_id, event_name, meta, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(userId, session_id, event_name, metaJson, Date.now())

  res.status(204).end()
}))

export default router
