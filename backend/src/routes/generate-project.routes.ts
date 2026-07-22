import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { ChainManager, pipelineEvents, getTaskStatus } from "../services/chain-manager"
import { DEFAULT_PIPELINE } from "../services/pipeline-agents"

/* ================================================================
   OSGARD · Генерация проекта — REST API + SSE-статус
   ----------------------------------------------------------------
   POST /generate-project ставит задачу в ChainManager и отвечает
   немедленно (202 + taskId); GET /task/:taskId — опрос статуса;
   GET /task/:taskId/stream — SSE-поток прогресса (потребляет
   pipelineEvents из chain-manager.ts). Паттерн повторяет
   routes/orchestrator.routes.ts (GET /stream/:executionId).
   ================================================================ */

const router = Router()
const chainManager = new ChainManager(DEFAULT_PIPELINE)

const MAX_ACTIVE_TASKS_PER_USER = 1

let activeSseConnections = 0
export function getGenerationSseConnections(): number {
  return activeSseConnections
}

/* ---------------- POST /generate-project ---------------- */
router.post(
  "/generate-project",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const { name, description } = req.body || {}

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Укажите название проекта" })
    }

    const active: any = db
      .prepare(`SELECT COUNT(*) as count FROM generation_tasks WHERE user_id = ? AND status IN ('queued','processing')`)
      .get(userId)

    if (active.count >= MAX_ACTIVE_TASKS_PER_USER) {
      return res.status(429).json({ error: "У вас уже есть активная генерация проекта. Дождитесь её завершения." })
    }

    const taskId = chainManager.start(userId, {
      name: name.trim(),
      description: typeof description === "string" ? description : undefined,
    })

    res.status(202).json({ taskId })
  }),
)

/* ---------------- GET /task/:taskId ---------------- */
router.get("/task/:taskId", requireAuth, (req: AuthRequest, res) => {
  const status = getTaskStatus(req.user!.userId, req.params.taskId)
  if (!status) return res.status(404).json({ error: "Задача не найдена" })
  res.json(status)
})

/* ---------------- GET /task/:taskId/stream (SSE) ---------------- */
router.get("/task/:taskId/stream", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const taskId = req.params.taskId
  const status = getTaskStatus(userId, taskId)
  if (!status) return res.status(404).json({ error: "Задача не найдена" })

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  const send = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  if (status.status === "completed" || status.status === "failed" || status.status === "cancelled") {
    send(
      status.status === "completed"
        ? { type: "task_done", result: status.result }
        : status.status === "cancelled"
          ? { type: "task_cancelled" }
          : { type: "task_error", error: status.error },
    )
    return res.end()
  }

  const channel = `task:${taskId}`
  const onEvent = (event: any) => {
    send(event)
    if (event.type === "task_done" || event.type === "task_error" || event.type === "task_cancelled") {
      cleanup()
      res.end()
    }
  }

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
  const cleanup = () => {
    clearInterval(heartbeat)
    pipelineEvents.off(channel, onEvent)
    activeSseConnections--
  }

  activeSseConnections++
  pipelineEvents.on(channel, onEvent)
  req.on("close", cleanup)
})

/* ---------------- POST /task/:taskId/cancel ---------------- */
router.post("/task/:taskId/cancel", requireAuth, (req: AuthRequest, res) => {
  const ok = chainManager.cancel(req.user!.userId, req.params.taskId)
  if (!ok) {
    return res.status(409).json({ error: "Задачу нельзя отменить: она не найдена или уже завершена" })
  }
  res.json({ ok: true })
})

/* ---------------- POST /task/:taskId/retry ---------------- */
router.post("/task/:taskId/retry", requireAuth, (req: AuthRequest, res) => {
  const ok = chainManager.retry(req.user!.userId, req.params.taskId)
  if (!ok) {
    return res.status(409).json({ error: "Повторный запуск возможен только для задач со статусом 'failed'" })
  }
  res.json({ ok: true })
})

export default router
