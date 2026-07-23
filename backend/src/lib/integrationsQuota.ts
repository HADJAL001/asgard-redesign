import { redisClient, ensureRedisConnected } from "./redis"
import type { PlanKey } from "./stripe"

/* ================================================================
   OSGARD · Дневной лимит вызовов Service Bridge (интеграций)
   ----------------------------------------------------------------
   Та же схема, что и orchestratorQuota.ts: ключ датируется по UTC
   (sbridge:req:{userId}:{YYYY-MM-DD}), Redis best-effort с откатом
   на in-memory Map. Лимит зависит от тарифа пользователя; elite —
   безлимитный (null).
   ================================================================ */

export const SERVICE_BRIDGE_LIMITS: Record<PlanKey, number | null> = {
  free: 20,
  pro: 100,
  supreme: 400,
  duo: 400,
  elite: null,
}

interface UsageRecord {
  count: number
  resetAt: number
}

const memoryUsage = new Map<string, UsageRecord>()

function todayKey(userId: number): string {
  const dateStr = new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
  return `sbridge:req:${userId}:${dateStr}`
}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return next - now.getTime()
}

export function getServiceBridgeLimit(plan: PlanKey): number | null {
  return SERVICE_BRIDGE_LIMITS[plan] ?? SERVICE_BRIDGE_LIMITS.free
}

export async function getServiceBridgeUsage(userId: number): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0

  const key = todayKey(userId)

  if (await ensureRedisConnected()) {
    try {
      const val = await redisClient!.get(key)
      return val ? Number(val) : 0
    } catch (err: any) {
      console.warn("[integrationsQuota] redis get failed, falling back to in-memory:", err.message)
    }
  }

  const record = memoryUsage.get(key)
  if (!record || record.resetAt < Date.now()) return 0
  return record.count
}

export async function incrementServiceBridgeUsage(userId: number): Promise<number> {
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
      console.warn("[integrationsQuota] redis incr failed, falling back to in-memory:", err.message)
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

/** true, если пользователь уже исчерпал дневной лимит для своего тарифа. */
export async function isServiceBridgeLimitExceeded(userId: number, plan: PlanKey): Promise<boolean> {
  const limit = getServiceBridgeLimit(plan)
  if (limit === null) return false
  const usage = await getServiceBridgeUsage(userId)
  return usage >= limit
}

setInterval(() => {
  const now = Date.now()
  for (const [key, record] of memoryUsage.entries()) {
    if (record.resetAt < now) memoryUsage.delete(key)
  }
}, 300_000)
