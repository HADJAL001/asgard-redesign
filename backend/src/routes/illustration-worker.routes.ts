import express, { Request, Response, NextFunction } from "express"
import db from "../lib/db"
import { asyncHandler } from "../utils/async-handler"

const router = express.Router()

/** Auth: простой static secret в заголовке, не JWT. Защищает воркер от остальных. */
function requireWorkerToken(req: Request, res: Response, next: NextFunction) {
  const token = req.headers["x-worker-token"] as string | undefined
  const expected = process.env.ILLUSTRATION_WORKER_TOKEN

  if (!expected) {
    console.error("[CRITICAL] ILLUSTRATION_WORKER_TOKEN not set in environment")
    return res.status(500).json({ error: "Worker auth not configured", code: "WORKER_TOKEN_NOT_SET" })
  }

  if (!token || token !== expected) {
    return res.status(401).json({ error: "Invalid worker token", code: "INVALID_WORKER_TOKEN" })
  }

  next()
}

router.use(requireWorkerToken)

/**
 * GET /worker/illustration-jobs/pending
 *
 * Получить список очередных job'ов для обработки. При чтении сразу меняет статус
 * на 'in_progress' с таймстампом — TOCTOU-safe: два одновременных запроса не возьмут
 * одну и ту же работу, как в runEconomyOp.
 *
 * Также перехватывает зависшие 'in_progress' job'ы (создание >30мин назад) и
 * возвращает их в 'queued' для переобработки.
 */
router.get(
  "/pending",
  asyncHandler(async (req: Request, res: Response) => {
    const now = Date.now()
    const CLAIM_TIMEOUT_MS = 30 * 60 * 1000 // 30 минут

    // Вернуть зависшие в очередь (если они висели >30мин в 'in_progress')
    db.prepare(`
      UPDATE artifacts
      SET illustration_status = 'queued'
      WHERE illustration_status = 'in_progress'
        AND illustration_queued_at IS NOT NULL
        AND (${now} - illustration_queued_at) > ?
    `).run(CLAIM_TIMEOUT_MS)

    // Забрать очередной job: UPDATE + SELECT в одной транзакции (authoritative claim)
    const jobs = db
      .prepare(`
        UPDATE artifacts
        SET illustration_status = 'in_progress',
            illustration_queued_at = ?
        WHERE id IN (
          SELECT id FROM artifacts
          WHERE illustration_status = 'queued'
          ORDER BY illustration_queued_at ASC
          LIMIT 1
        )
        RETURNING id, name, type, rarity, illustration_prompt
      `)
      .all(now) as Array<{
        id: string
        name: string
        type: string | null
        rarity: string
        illustration_prompt: string
      }>

    if (jobs.length === 0) {
      return res.status(200).json({ jobs: [] })
    }

    res.status(200).json({ jobs })
  }),
)

/**
 * POST /worker/illustration-jobs/:id/complete
 *
 * Загрузить сгенерированную картинку (base64 data URI) и обновить статус.
 *
 * Body:
 *   {
 *     "illustrationUrl": "data:image/png;base64,iVBORw0KG...",
 *     "status": "ready" | "failed",
 *     "error"?: "optional error message"
 *   }
 */
router.post(
  "/:id/complete",
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params
    const { illustrationUrl, status, error } = req.body

    if (!id) {
      return res.status(400).json({ error: "Missing artifact ID", code: "MISSING_ID" })
    }

    if (!["ready", "failed"].includes(status)) {
      return res.status(400).json({ error: "Invalid status", code: "INVALID_STATUS" })
    }

    // Проверка размера data URI (примерно: ~2.8M base64 chars = ~2MB декодировано)
    if (status === "ready" && illustrationUrl) {
      const MAX_DATA_URI_CHARS = 2_800_000
      if (illustrationUrl.length > MAX_DATA_URI_CHARS) {
        return res.status(413).json({
          error: `Image too large (max ${MAX_DATA_URI_CHARS} base64 chars = ~2MB)`,
          code: "IMAGE_TOO_LARGE",
        })
      }
    }

    // Обновить артефакт (только если он ещё в 'in_progress')
    const result = db
      .prepare(`
        UPDATE artifacts
        SET illustration_status = ?,
            illustration_url = ?
        WHERE id = ? AND illustration_status = 'in_progress'
        RETURNING id
      `)
      .get(status, status === "ready" ? illustrationUrl : null, id) as { id?: string } | undefined

    if (!result) {
      return res.status(404).json({
        error: "Artifact not found or not in in_progress state",
        code: "NOT_FOUND",
      })
    }

    if (status === "failed" && error) {
      console.warn(`[illustration] Job ${id} failed: ${error}`)
    }

    res.status(200).json({ artifactId: result.id, status })
  }),
)

export default router
