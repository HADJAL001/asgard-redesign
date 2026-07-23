import { redisClient, ensureRedisConnected } from "./redis"
import type { PlanKey } from "./stripe"

/* ================================================================
   OSGARD · Дневной лимит генераций проекта (Free/Pro)
   ----------------------------------------------------------------
   Пайплайн генерации (chain-manager.ts → pipeline-agents.ts) на каждом
   из 9 шагов делает каскад Claude → DeepSeek → локальный фолбэк с
   кэшированием — буквально посчитать "1 вызов Claude" на уровне
   провайдера здесь невозможно. Поэтому квота "генераций" — один общий
   дневной счётчик, без разбивки по провайдерам.

   Supreme/Duo/Elite не покупают "генерации" отдельно (платят за
   оркестратор с квотами по провайдерам, см. orchestratorProviderQuota.ts) —
   для них лимит null (безлимит на этом счётчике).

   Та же схема, что и orchestratorQuota.ts/integrationsQuota.ts: ключ
   датируется по UTC (gen:req:{userId}:{YYYY-MM-DD}), Redis best-effort
   с откатом на in-memory Map.
   ================================================================ */

export const GENERATION_LIMITS: Record<PlanKey, number | null> = {
  free: 5,
  pro: 20,
  supreme: null,
  duo: null,
  elite: null,
}

interface UsageRecord {
  count: number
  resetAt: number
}

const memoryUsage = new Map<string, UsageRecord>()

function todayKey(userId: number): string {
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
  return `gen:req:${userId}:${dateStr}`
}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}

export function getGenerationLimit(plan: PlanKey): number | null {
  return GENERATION_LIMITS[plan] ?? GENERATION_LIMITS.free
}

export async function getGenerationUsage(userId: number): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0

  const key = todayKey(userId)

  if (await ensureRedisConnected()) {
    try {
      const val = await redisClient!.get(key)
      return val ? Number(val) : 0
    } catch (err: any) {
      console.warn("[generationsQuota] redis get failed, falling back to in-memory:", err.message)
    }
  }

  const record = memoryUsage.get(key)
  if (!record || record.resetAt < Date.now()) return 0
  return record.count
}

export async function incrementGenerationUsage(userId: number): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0

  const key = todayKey(userId)

  if (await ensureRedisConnected()) {
    try {
      const count = await redisClient!.incr(key)
      if (count === 1) {
        await redisClient!.pexpire(key, msUntilNextUtcMidnight())
      }
      return count
    } catch (err: any) {
      console.warn("[generationsQuota] redis incr failed, falling back to in-memory:", err.message)
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

/** true, если пользователь уже исчерпал дневной лимит генераций для своего тарифа. */
export async function isGenerationLimitExceeded(userId: number, plan: PlanKey): Promise<boolean> {
  const limit = getGenerationLimit(plan)
  if (limit === null) return false
  const usage = await getGenerationUsage(userId)
  return usage >= limit
}

setInterval(() => {
  const now = Date.now()
  for (const [key, record] of memoryUsage.entries()) {
    if (record.resetAt < now) memoryUsage.delete(key)
  }
}, 300_000)
