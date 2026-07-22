/* ================================================================
   OSGARD · Метрики агентского кэша
   ----------------------------------------------------------------
   Считает hit/miss и оценивает размер только той части кэша, которую
   создают агенты (ключи вида "agent:<type>:<hash>", см. cacheKey()
   в base-agent.ts) — не общий Redis/in-memory кэш всего backend.

   Почему не читаем размер/память напрямую из cacheService/redis:
   - cacheService (services/cache.service.ts) экспортирует только
     set/get/del/getOrSet — ни Redis-клиент, ни internal Map не
     являются публичными полями объекта.
   - Даже если их пробросить, redisClient.dbsize()/info("memory")
     посчитали бы ВСЕ ключи в базе (казна, курсы, лидерборды и т.п.,
     см. комментарий в cache.service.ts), что для метрики "сколько
     весит именно кэш агентов" бессмысленно и вводит в заблуждение.

   Поэтому здесь ведём собственный учёт: каждый вызов BaseAgent.withCache
   регистрирует hit/miss и трекает свой ключ с TTL; getSize()/getStats()
   лениво вычищают протухшие по TTL записи перед подсчётом.
   ================================================================ */

interface RoleStats {
  hits: number
  misses: number
  totalComputeMs: number
}

interface RoleStatsSnapshot {
  hits: number
  misses: number
  hitRate: number
  avgComputeMs: number
}

export interface CacheMetricsSnapshot {
  byRole: Record<string, RoleStatsSnapshot>
  trackedKeys: number
}

const statsByRole = new Map<string, RoleStats>()
const trackedKeys = new Map<string, number>()

function ensureRole(role: string): RoleStats {
  let stats = statsByRole.get(role)
  if (!stats) {
    stats = { hits: 0, misses: 0, totalComputeMs: 0 }
    statsByRole.set(role, stats)
  }
  return stats
}

function pruneExpiredKeys(): void {
  const now = Date.now()
  for (const [key, expiresAt] of trackedKeys) {
    if (expiresAt <= now) trackedKeys.delete(key)
  }
}

export const CacheMetrics = {
  recordHit(role: string): void {
    ensureRole(role).hits += 1
  },

  recordMiss(role: string, computeMs: number): void {
    const stats = ensureRole(role)
    stats.misses += 1
    stats.totalComputeMs += computeMs
  },

  trackKey(key: string, ttlSeconds: number): void {
    trackedKeys.set(key, Date.now() + ttlSeconds * 1000)
  },

  untrackKey(key: string): void {
    trackedKeys.delete(key)
  },

  getStats(): CacheMetricsSnapshot {
    const byRole: Record<string, RoleStatsSnapshot> = {}
    for (const [role, stats] of statsByRole) {
      const total = stats.hits + stats.misses
      byRole[role] = {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: total > 0 ? stats.hits / total : 0,
        avgComputeMs: stats.misses > 0 ? Math.round(stats.totalComputeMs / stats.misses) : 0,
      }
    }
    pruneExpiredKeys()
    return { byRole, trackedKeys: trackedKeys.size }
  },

  /** Приблизительный размер кэша агентов — количество ещё не протухших по TTL
   *  ключей вида "agent:*", которые сам процесс успел создать через withCache().
   *  Не отражает ключи, созданные другими процессами/инстансами, если кэш общий (Redis). */
  getSize(): { trackedKeys: number } {
    pruneExpiredKeys()
    return { trackedKeys: trackedKeys.size }
  },
}
