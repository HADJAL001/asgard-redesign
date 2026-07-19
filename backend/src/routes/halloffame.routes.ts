import { Router } from "express"
import db from "../lib/db"

const router = Router()

/* ---------------- GET /hall-of-fame ---------------- */
router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200)

  const items = db
    .prepare(
      `SELECT id, artifact_id as artifactId, artifact_name as artifactName, type, rarity,
              architect, price, achieved_at as achievedAt
       FROM hall_of_fame
       ORDER BY price DESC
       LIMIT ?`,
    )
    .all(limit)

  res.json({ hallOfFame: items })
})

export default router
