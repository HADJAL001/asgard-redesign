import { Router, Request, Response } from "express"
import { startGuestGeneration, getGuestTask, GuestGenerationBusyError } from "../services/guest-code-store"

/* ================================================================
   OSGARD · Demo Code Routes — гостевая live-генерация КОДА (Part 2)
   ----------------------------------------------------------------
   Без авторизации. Отдельно от demo.routes.ts (тот генерирует
   флейвор-проект + артефакты; здесь — реальные файлы кода через
   app-generator).

   POST /demo/code/start {name, hint}  → 202 {taskId}
   GET  /demo/code/:taskId             → {status, result?:{files}, error?}

   Контракт совпадает с фронтовым hooks/useGuestCodeGeneration.ts.
   SSE-стрим пока не реализован — фронт-хук работает и через polling;
   для SSE понадобится regex в app/api/[...path]/route.ts (зона A).

   IP-лимит: свой лёгкий in-memory (независим от demo.routes.ts, чтобы
   не тянуть его приватный лимитер). Сбрасывается при рестарте.
   ================================================================ */

const router = Router()

const IP_LIMIT = 5
const IP_WINDOW_MS = 24 * 60 * 60 * 1000

interface IpEntry {
  count: number
  resetAt: number
}
const ipMap = new Map<string, IpEntry>()

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"]
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim()
  }
  return req.socket.remoteAddress || "unknown"
}

function checkIpLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()

  /* Попутно чистим протухшие записи, чтобы ipMap не рос бесконечно
     (без этого каждый уникальный IP оставался бы в памяти навсегда). */
  for (const [key, e] of ipMap) {
    if (e.resetAt < now) ipMap.delete(key)
  }

  let entry = ipMap.get(ip)
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + IP_WINDOW_MS }
    ipMap.set(ip, entry)
  }
  if (entry.count >= IP_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }
  entry.count++
  return { allowed: true, remaining: IP_LIMIT - entry.count, resetAt: entry.resetAt }
}

/* ---------------- POST /demo/code/start ---------------- */
router.post("/start", (req: Request, res: Response) => {
  const { name, hint } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  const ip = getClientIp(req)
  const { allowed, resetAt } = checkIpLimit(ip)
  if (!allowed) {
    return res.status(429).json({
      error: "Лимит гостевых генераций кода исчерпан. Попробуйте через 24 часа или зарегистрируйтесь.",
      resetAt,
    })
  }

  /* Обрезаем вход — name/hint уходят прямо в AI-промпт, а generateApp сам их
     не ограничивает. Защита от раздувания промпта/стоимости. */
  const safeName = name.trim().slice(0, 100)
  const safeHint = typeof hint === "string" ? hint.slice(0, 500) : undefined

  try {
    const taskId = startGuestGeneration(safeName, safeHint)
    res.status(202).json({ taskId })
  } catch (err) {
    if (err instanceof GuestGenerationBusyError) {
      return res.status(429).json({ error: err.message })
    }
    throw err
  }
})

/* ---------------- GET /demo/code/:taskId ---------------- */
router.get("/:taskId", (req: Request, res: Response) => {
  const task = getGuestTask(req.params.taskId)
  if (!task) {
    return res.status(404).json({ error: "Задача не найдена или устарела" })
  }

  res.json({
    status: task.status,
    result: task.result ? { files: task.result.files } : undefined,
    error: task.error,
  })
})

export default router
