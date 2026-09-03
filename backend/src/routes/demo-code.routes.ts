import { Router, Request, Response } from "express"
import { startGuestGeneration, getGuestTask, GuestGenerationBusyError } from "../services/guest-code-store"
import { getClientIp } from "../lib/admin-audit"
import { ensureRedisConnected, redisClient } from "../lib/redis"
import { rateLimit } from "../middleware/rateLimiter"

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

router.use((_req, res, next) => {
  res.set({
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  })
  next()
})

const IP_LIMIT = 5
const IP_WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_MEMORY_IPS = 10_000

interface IpEntry {
  count: number
  resetAt: number
}
const ipMap = new Map<string, IpEntry>()

function memoryCheckIpLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()

  /* Попутно чистим протухшие записи, чтобы ipMap не рос бесконечно
     (без этого каждый уникальный IP оставался бы в памяти навсегда). */
  if (ipMap.size >= MAX_MEMORY_IPS) {
    for (const [key, value] of ipMap) {
      if (value.resetAt < now) ipMap.delete(key)
    }
  }

  let entry = ipMap.get(ip)
  if (!entry || entry.resetAt < now) {
    if (!entry && ipMap.size >= MAX_MEMORY_IPS) {
      const oldest = ipMap.keys().next().value
      if (oldest !== undefined) ipMap.delete(oldest)
    }
    entry = { count: 0, resetAt: now + IP_WINDOW_MS }
    ipMap.set(ip, entry)
  }
  if (entry.count >= IP_LIMIT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt }
  }
  entry.count++
  return { allowed: true, remaining: IP_LIMIT - entry.count, resetAt: entry.resetAt }
}

async function checkIpLimit(ip: string): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const key = `guest_code_limit:${ip}`
  if (await ensureRedisConnected()) {
    try {
      const count = await redisClient!.incr(key)
      if (count === 1) await redisClient!.pexpire(key, IP_WINDOW_MS)
      const ttl = await redisClient!.pttl(key)
      const resetAt = Date.now() + (ttl > 0 ? ttl : IP_WINDOW_MS)
      return count > IP_LIMIT
        ? { allowed: false, remaining: 0, resetAt }
        : { allowed: true, remaining: IP_LIMIT - count, resetAt }
    } catch (err) {
      console.warn("[guest-code] redis limit failed, using memory fallback:", err instanceof Error ? err.message : err)
    }
  }
  return memoryCheckIpLimit(ip)
}

/* ---------------- POST /demo/code/start ---------------- */
router.post("/start", async (req: Request, res: Response) => {
  const { name, hint } = req.body || {}

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "Укажите название проекта" })
  }

  const ip = getClientIp(req) || "unknown"
  const { allowed, resetAt } = await checkIpLimit(ip)
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
router.get(
  "/:taskId",
  rateLimit(60_000, 90, (req) => `guest-code-poll:${getClientIp(req) || "unknown"}`),
  (req: Request, res: Response) => {
  const task = getGuestTask(req.params.taskId)
  if (!task) {
    return res.status(404).json({ error: "Задача не найдена или устарела" })
  }

  res.json({
    status: task.status,
    result: task.result ? { files: task.result.files, source: task.result.source } : undefined,
    error: task.error,
  })
  },
)

export default router
