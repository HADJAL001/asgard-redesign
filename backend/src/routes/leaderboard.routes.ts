import { Router } from "express"
import db from "../lib/db"

const router = Router()

/* ---------------- GET /leaderboard ---------------- */
/* Рейтинг архитекторов: по суммарному доходу от продаж артефактов */
router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)

  const leaderboard = db
    .prepare(
      `SELECT
         u.id as userId,
         u.username,
         u.display_name as displayName,
         u.avatar_url as avatarUrl,
         u.level,
         COALESCE(SUM(CASE WHEN t.type = 'sale' THEN t.amount ELSE 0 END), 0) as totalIncome,
         COUNT(DISTINCT CASE WHEN t.type = 'sale' THEN t.id END) as totalSales,
         (SELECT COUNT(*) FROM artifacts a WHERE a.owner_id = u.id) as artifactCount
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
       GROUP BY u.id
       ORDER BY totalIncome DESC
       LIMIT ?`,
    )
    .all(limit)

  res.json({ leaderboard })
})

export default router
