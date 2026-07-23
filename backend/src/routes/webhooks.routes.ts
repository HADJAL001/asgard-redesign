import { Router } from "express"
import { randomBytes } from "node:crypto"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { isPublicHttpUrl } from "../lib/url-safety"

/* ================================================================
   OSGARD · Регистрация webhook'ов для уведомлений о генерации проекта
   ----------------------------------------------------------------
   CRUD от лица пользователя (миграция 046). Рассылка — отдельно, в
   services/webhook.service.ts, вызывается из ChainManager.
   ================================================================ */

const router = Router()

const MAX_WEBHOOKS_PER_USER = 5

/* ---------------- GET /webhooks ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare(`SELECT id, url, enabled, created_at FROM webhooks WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.user!.userId)
  res.json({ webhooks: rows })
})

/* ---------------- POST /webhooks ---------------- */
router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const { url } = req.body || {}

    if (!url || typeof url !== "string" || !isPublicHttpUrl(url)) {
      return res.status(400).json({ error: "Укажите корректный публичный http(s) URL" })
    }

    const count: any = db.prepare(`SELECT COUNT(*) as count FROM webhooks WHERE user_id = ?`).get(userId)
    if (count.count >= MAX_WEBHOOKS_PER_USER) {
      return res.status(429).json({ error: `Достигнут лимит webhook'ов (${MAX_WEBHOOKS_PER_USER})` })
    }

    const secret = randomBytes(24).toString("hex")
    const result = db
      .prepare(`INSERT INTO webhooks (user_id, url, secret, enabled, created_at) VALUES (?, ?, ?, 1, ?)`)
      .run(userId, url, secret, Date.now())

    res.status(201).json({ id: result.lastInsertRowid, url, secret, enabled: true })
  }),
)

/* ---------------- DELETE /webhooks/:id ---------------- */
router.delete("/:id", requireAuth, (req: AuthRequest, res) => {
  const result = db
    .prepare(`DELETE FROM webhooks WHERE id = ? AND user_id = ?`)
    .run(Number(req.params.id), req.user!.userId)

  if (result.changes === 0) {
    return res.status(404).json({ error: "Webhook не найден" })
  }
  res.json({ ok: true })
})

export default router
