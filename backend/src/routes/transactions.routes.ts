import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

const router = Router()

/* ---------------- GET /transactions ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)

  const transactions = db
    .prepare(
      `SELECT id, type, item, counterparty, amount, currency, status, created_at as createdAt
       FROM transactions
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(req.user!.userId, limit)

  res.json({ transactions })
})

export default router
