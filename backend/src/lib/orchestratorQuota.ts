import { redisClient, ensureRedisConnected } from "./redis"

/* ================================================================
   OSGARD · Дневной лимит запусков AI-оркестратора
   ----------------------------------------------------------------
   Ключ датируется по UTC (orch:req:{userId}:{YYYY-MM-DD}), поэтому
   в отличие от rateLimiter.ts (скользящее окно) TTL всегда считается
   как остаток до следующей полуночи UTC, а не фиксированный windowMs.
   Redis — best-effort (см. redis.ts), при недоступности откатываемся
   на in-memory Map, как и в rateLimiter.ts.

   Лимиты по тарифу:
     free / unsubscribed — FREE_ORCHESTRATOR_LIMIT запусков/день
     master / legend     — ORCHESTRATOR_DAILY_LIMIT запусков/день
   ================================================================ */

/** Дневной лимит для подписчиков master/legend */
export const ORCHESTRATOR_DAILY_LIMIT = 10

/** Дневной лимит для free-пользователей (бесплатный пробник оркестратора) */
export const FREE_ORCHESTRATOR_LIMIT = 5

interface UsageRecord {
  count: number
  resetAt: number
}

const memoryUsage = new Map<string, UsageRecord>()

function todayKey(userId: number): string {
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
  return `orch:req:${userId}:${dateStr}`
}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}

export async function getOrchestratorUsage(userId: number): Promise<number> {
  const key = todayKey(userId)

  if (await ensureRedisConnected()) {
    try {
      const val = await redisClient!.get(key)
      return val ? Number(val) : 0
    } catch (err: any) {
      console.warn("[orchestratorQuota] redis get failed, falling back to in-memory:", err.message)
    }
  }

  const record = memoryUsage.get(key)
  if (!record || record.resetAt < Date.now()) return 0
  return record.count
}

export async function incrementOrchestratorUsage(userId: number): Promise<number> {
  const key = todayKey(userId)

  if (await ensureRedisConnected()) {
    try {
      const count = await redisClient!.incr(key)
      if (count === 1) {
        await redisClient!.pexpire(key, msUntilNextUtcMidnight())
      }
      return count
    } catch (err: any) {
      console.warn("[orchestratorQuota] redis incr failed, falling back to in-memory:", err.message)
    }
  }

  const record = memoryUsage.get(key)
  if (!record || record.resetAt < Date.now()) {
    memoryUsage.set(key, { count: 1, resetAt: Date.now() + msUntilNextUtcMidnight() })
    return 1
  }
  record.count++
  return record.count
}

// Очистка устаревших in-memory записей каждые 5 минут (Redis чистит себя сам через PEXPIRE)
setInterval(() => {
  const now = Date.now()
  for (const [key, record] of memoryUsage.entries()) {
    if (record.resetAt < now) memoryUsage.delete(key)
  }
}, 300_000)
