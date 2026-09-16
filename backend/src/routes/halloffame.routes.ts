import { Router } from "express"
import db from "../lib/db"
import { requireAuth, optionalAuth, AuthRequest } from "../middleware/authMiddleware"
import { rateLimit } from "../middleware/rateLimiter"
import { reactionCountsFor, reactedByUser, toggleReaction, weeklyTopHallOfFame } from "../lib/activity-reactions"

const router = Router()

/* ---------------- GET /hall-of-fame ----------------
   Зал Славы — только топ-100 крупнейших продаж (жёсткий кап 100:
   витрина «лучших из лучших», не полный лог). Запросить больше нельзя,
   даже передав больший ?limit — сознательное продуктовое решение. */
router.get("/", optionalAuth, (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 100)

  const items = db
    .prepare(
      `SELECT id, artifact_id as artifactId, artifact_name as artifactName, type, rarity,
              architect, price, achieved_at as achievedAt
       FROM hall_of_fame
       ORDER BY price DESC
       LIMIT ?`,
    )
    .all(limit) as Array<{ id: number }>

  const ids = items.map((i) => i.id)
  const counts = reactionCountsFor("hall_of_fame", ids)
  const reacted = reactedByUser("hall_of_fame", ids, req.user?.userId ?? null)

  res.json({
    hallOfFame: items.map((item) => ({
      ...item,
      reactionCount: counts.get(item.id) ?? 0,
      reactedByMe: reacted.has(item.id),
    })),
  })
})

/* ---------------- POST /hall-of-fame/:id/react ---------------- */
router.post("/:id/react", rateLimit(60_000, 30), requireAuth, (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid hall of fame id" })
  }
  const exists = db.prepare(`SELECT 1 FROM hall_of_fame WHERE id = ?`).get(id)
  if (!exists) return res.status(404).json({ error: "Entry not found" })

  const result = toggleReaction("hall_of_fame", id, req.user!.userId)
  res.json({ success: true, ...result })
})

/* ---------------- GET /hall-of-fame/weekly-top ----------------
   Топ-1 (или больше) прошлой полной недели по реакциям — источник для
   награды "бесплатный Elite" на следующей неделе. Считается по прошлой,
   а не текущей неделе, чтобы результат не менялся реакцией post-factum. */
router.get("/weekly-top", (req, res) => {
  const now = new Date()
  const dayMs = 24 * 60 * 60 * 1000
  // Понедельник текущей недели, 00:00 UTC — начало прошлой недели на 7 дней раньше.
  const dow = (now.getUTCDay() + 6) % 7 // 0=Monday
  const thisMonday = new Date(now)
  thisMonday.setUTCHours(0, 0, 0, 0)
  thisMonday.setUTCDate(thisMonday.getUTCDate() - dow)
  const untilMs = thisMonday.getTime()
  const sinceMs = untilMs - 7 * dayMs

  const limit = Math.min(Number(req.query.limit) || 1, 10)
  const top = weeklyTopHallOfFame(sinceMs, untilMs, limit)
  res.json({ success: true, since: sinceMs, until: untilMs, top })
})

export default router
