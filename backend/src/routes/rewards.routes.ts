import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { getDailyStatus, claimDaily } from "../lib/daily-streak"

const router = Router()

/* GET /rewards/daily/status — состояние ежедневной награды текущего юзера. */
router.get("/daily/status", requireAuth, (req: AuthRequest, res) => {
  res.json(getDailyStatus(req.user!.userId))
})

/* POST /rewards/daily/claim — забрать награду (идемпотентно в рамках дня). */
router.post("/daily/claim", requireAuth, (req: AuthRequest, res) => {
  const r = claimDaily(req.user!.userId)
  if (!r.ok) {
    return res.status(409).json({ error: "Награда уже получена сегодня", code: "ALREADY_CLAIMED", streak: r.streak })
  }
  res.json({ ok: true, streak: r.streak, reward: r.reward, nextReward: r.nextReward, currency: "credits" })
})

export default router
