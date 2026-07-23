import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"

/* ================================================================
   OSGARD · Регистрация push-токенов мобильного приложения
   ----------------------------------------------------------------
   POST /push/register — upsert Expo push-токена для текущего юзера
   (миграция 064). Рассылка — отдельно, в services/push.service.ts
   (используется там, где сейчас создаются in-app notifications).
   ================================================================ */

const router = Router()

const ALLOWED_PLATFORMS = new Set(["ios", "android"])

/* ---------------- POST /push/register ---------------- */
router.post(
  "/register",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const { token, platform } = req.body || {}

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Укажите push-токен" })
    }
    if (!platform || !ALLOWED_PLATFORMS.has(platform)) {
      return res.status(400).json({ error: "Укажите платформу: ios или android" })
    }

    const existing: any = db.prepare(`SELECT id, user_id FROM push_tokens WHERE token = ?`).get(token)
    if (existing) {
      db.prepare(`UPDATE push_tokens SET user_id = ?, platform = ?, enabled = 1 WHERE id = ?`).run(
        userId,
        platform,
        existing.id,
      )
      return res.json({ ok: true, id: existing.id })
    }

    const result = db
      .prepare(`INSERT INTO push_tokens (user_id, token, platform, enabled, created_at) VALUES (?, ?, ?, 1, ?)`)
      .run(userId, token, platform, Date.now())

    res.status(201).json({ ok: true, id: result.lastInsertRowid })
  }),
)

/* ---------------- DELETE /push/register ---------------- */
router.delete(
  "/register",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const { token } = req.body || {}
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Укажите push-токен" })
    }

    db.prepare(`DELETE FROM push_tokens WHERE token = ? AND user_id = ?`).run(token, req.user!.userId)
    res.json({ ok: true })
  }),
)

export default router
