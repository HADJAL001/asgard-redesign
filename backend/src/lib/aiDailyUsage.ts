import db from "./db"
import { redisClient, ensureRedisConnected } from "./redis"

/* ================================================================
   OSGARD · AI Daily Usage — дневные лимиты AI-генераций
   ----------------------------------------------------------------
   Отслеживает использование AI-провайдеров (Claude / Grok / DeepSeek)
   в разбивке по пользователю за текущий UTC-день.

   Лимиты по тарифам:
     free      — 1 Claude,  2 Grok,  2 DeepSeek,  5 total/день
     architect — 2 Claude,  4 Grok,  9 DeepSeek, 15 total/день
     master    — 4 Claude,  8 Grok, 28 DeepSeek, 40 total/день
     legend    — unlimited (null)

   Хранение: таблица ai_daily_usage (см. migration 041).
   Redis-слой используется для быстрых инкрементов без лишних
   SELECT, с fallback на SQLite при недоступности Redis.
   ================================================================ */

export type AiProvider = "claude" | "grok" | "deepseek"

export interface AiUsageLimits {
  claude:   number | null
  grok:     number | null
  deepseek: number | null
  total:    number | null
}

export interface AiUsageCounters {
  claude:   number
  grok:     number
  deepseek: number
  total:    number
}

/** Лимиты по каждому тарифу. null = безлимит. */
export const AI_LIMITS_BY_PLAN: Record<string, AiUsageLimits> = {
  free:      { claude: 1,    grok: 2,    deepseek: 2,    total: 5  },
  architect: { claude: 2,    grok: 4,    deepseek: 9,    total: 15 },
  master:    { claude: 4,    grok: 8,    deepseek: 28,   total: 40 },
  legend:    { claude: null, grok: null, deepseek: null, total: null },
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

function msUntilNextUtcMidnight(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()
}

/* ── Redis helpers ─────────────────────────────────────────────── */

function redisKey(userId: number, provider: AiProvider): string {
  return `ai_usage:${userId}:${provider}:${todayUtc()}`
}

async function redisIncr(userId: number, provider: AiProvider): Promise<number | null> {
  if (!(await ensureRedisConnected())) return null
  try {
    const key = redisKey(userId, provider)
    const count = await redisClient!.incr(key)
    if (count === 1) await redisClient!.pexpire(key, msUntilNextUtcMidnight())
    return count
  } catch {
    return null
  }
}

async function redisGet(userId: number, provider: AiProvider): Promise<number | null> {
  if (!(await ensureRedisConnected())) return null
  try {
    const val = await redisClient!.get(redisKey(userId, provider))
    return val === null ? 0 : Number(val)
  } catch {
    return null
  }
}

/* ── SQLite helpers ────────────────────────────────────────────── */

function ensureTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_daily_usage (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      provider    TEXT    NOT NULL,
      date_utc    TEXT    NOT NULL,
      count       INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL,
      UNIQUE(user_id, provider, date_utc)
    )
  `)
}

function sqliteIncr(userId: number, provider: AiProvider): number {
  ensureTable()
  const today = todayUtc()
  const now = Date.now()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(`
      INSERT INTO ai_daily_usage (user_id, provider, date_utc, count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, provider, date_utc)
      DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
    `).run(userId, provider, today, now)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  const row: any = db.prepare(`
    SELECT count FROM ai_daily_usage WHERE user_id = ? AND provider = ? AND date_utc = ?
  `).get(userId, provider, today)
  return row?.count ?? 1
}

function sqliteGet(userId: number, provider: AiProvider): number {
  ensureTable()
  const row: any = db.prepare(`
    SELECT count FROM ai_daily_usage WHERE user_id = ? AND provider = ? AND date_utc = ?
  `).get(userId, provider, todayUtc())
  return row?.count ?? 0
}

/* ── Public API ────────────────────────────────────────────────── */

/**
 * Инкрементирует счётчик использования AI-провайдера для пользователя.
 * Возвращает новый счётчик после инкремента.
 */
export async function incrementAiUsage(userId: number, provider: AiProvider): Promise<number> {
  const redisResult = await redisIncr(userId, provider)
  if (redisResult !== null) return redisResult
  return sqliteIncr(userId, provider)
}

/**
 * Проверяет, не исчерпан ли лимит провайдера и общий дневной лимит.
 * Возвращает { allowed: true } если можно делать запрос,
 * либо { allowed: false, reason } с описанием ограничения.
 */
export async function checkAiLimit(
  userId: number,
  provider: AiProvider,
  plan: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const limits = AI_LIMITS_BY_PLAN[plan] ?? AI_LIMITS_BY_PLAN.free
  if (limits[provider] === null && limits.total === null) return { allowed: true }

  const used = await getAiUsage(userId)

  if (limits[provider] !== null && used[provider] >= limits[provider]!) {
    return {
      allowed: false,
      reason: `Дневной лимит ${provider} (${limits[provider]}) исчерпан для тарифа «${plan}». Сбрасывается в полночь UTC.`,
    }
  }

  if (limits.total !== null && used.total >= limits.total) {
    return {
      allowed: false,
      reason: `Общий дневной лимит AI-запросов (${limits.total}) исчерпан для тарифа «${plan}». Сбрасывается в полночь UTC.`,
    }
  }

  return { allowed: true }
}

/** Возвращает текущее дневное использование по всем провайдерам для пользователя. */
export async function getAiUsage(userId: number): Promise<AiUsageCounters> {
  const providers: AiProvider[] = ["claude", "grok", "deepseek"]
  const counts: AiUsageCounters = { claude: 0, grok: 0, deepseek: 0, total: 0 }

  for (const p of providers) {
    const redis = await redisGet(userId, p)
    counts[p] = redis !== null ? redis : sqliteGet(userId, p)
  }

  counts.total = counts.claude + counts.grok + counts.deepseek
  return counts
}
