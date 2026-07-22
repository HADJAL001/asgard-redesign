import { Router } from "express"
import { randomBytes } from "node:crypto"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"

/* ================================================================
   OSGARD · Регистрация webhook'ов для уведомлений о генерации проекта
   ----------------------------------------------------------------
   CRUD от лица пользователя (миграция 046). Рассылка — отдельно, в
   services/webhook.service.ts, вызывается из ChainManager.
   ================================================================ */

const router = Router()

const MAX_WEBHOOKS_PER_USER = 5

/* URL webhook'а задаёт пользователь, а сервер сам делает на него запрос —
   классический вектор SSRF (доступ к внутренней сети/cloud metadata под
   видом "просто уведомления"). Разрешаем только http(s) на публичные хосты
   и блокируем очевидные внутренние/loopback/metadata адреса по имени хоста.
   Это не полноценная защита от DNS-rebinding (для этого нужна проверка
   резолвленного IP непосредственно перед каждым fetch), но отсекает
   подавляющее большинство тривиальных попыток. */
function isAllowedWebhookUrl(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false

  const host = url.hostname.toLowerCase()
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false
  if (host === "169.254.169.254") return false // cloud metadata (AWS/GCP/Azure)
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false
  if (host.endsWith(".local") || host.endsWith(".internal")) return false

  return true
}

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

    if (!url || typeof url !== "string" || !isAllowedWebhookUrl(url)) {
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
