import { Router } from "express"
import db from "../lib/db"

const router = Router()

/* ---------------- GET /users/:id — публичный профиль ---------------- */
router.get("/:id", (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Некорректный ID пользователя" })
  }

  const user: any = db
    .prepare(
      `SELECT u.id, u.username, u.display_name as displayName, u.avatar_url as avatarUrl, u.level,
              u.bio, u.created_at as createdAt,
              COALESCE(SUM(CASE WHEN t.type = 'sale' THEN t.amount ELSE 0 END), 0) as totalIncome,
              COUNT(DISTINCT CASE WHEN t.type = 'sale' THEN t.id END) as totalSales,
              (SELECT COUNT(*) FROM artifacts a WHERE a.owner_id = u.id) as artifactCount
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
       WHERE u.id = ?
       GROUP BY u.id`,
    )
    .get(id)

  if (!user) {
    /* Код специально НЕ "USER_NOT_FOUND" — apiClient на фронтенде интерпретирует
       этот code как «протухшая сессия» и редиректит на /login, что здесь неуместно:
       это публичный профиль стороннего пользователя, а не сессия текущего. */
    return res.status(404).json({ error: "Пользователь не найден", code: "PROFILE_NOT_FOUND" })
  }

  res.json({ user })
})

/* ---------------- GET /users/:id/artifacts — публичный список артефактов ---------------- */
router.get("/:id/artifacts", (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "Некорректный ID пользователя" })
  }

  const artifacts = db
    .prepare(
      `SELECT id, name, type, rarity, level, power, defense, magic, speed,
              status, price, list_currency as listCurrency, ai_visual as aiVisual,
              visual_effect as visualEffect, created_at as createdAt
       FROM artifacts WHERE owner_id = ? ORDER BY created_at DESC`,
    )
    .all(id)

  res.json({ artifacts })
})

export default router
