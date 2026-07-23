import db from "./db"
import { redisClient, ensureRedisConnected } from "./redis"
import type { PlanKey } from "./stripe"

export type AiProvider = "claude" | "grok" | "deepseek"

/* ================================================================
   OSGARD · Месячная квота оркестратора по AI-провайдерам (Supreme+)
   ----------------------------------------------------------------
   В отличие от generationsQuota.ts (один общий дневной счётчик —
   пайплайн генерации не позволяет буквально посчитать провайдера),
   каждый узел оркестратора (orchestrator-nodes.ts: runNode()) — это
   ровно один явный вызов ровно одного провайдера, поэтому здесь
   квота считается буквально и точно: Redis — быстрый путь инкрементов/
   чтений, SQLite (orchestrator_monthly_usage,
   см. migration 050) — durable fallback при недоступности Redis.

   Free/Pro к оркестратору доступа не имеют (лимит 0) — сам доступ
   гейтится жёстко в orchestrator.routes.ts (requirePlan("supreme")),
   лимит здесь на 0 лишь для полноты картины/симметрии таблицы.

   После исчерпания месячной базовой квоты списывается 1 из
   extra_credits (докупленные пакеты — не сгорают, переносятся на
   следующий месяц).
   ================================================================ */

export const PROVIDER_MONTHLY_LIMITS: Record<PlanKey, number | null> = {
  free: 0,
  pro: 0,
  supreme: 10,
  duo: 10,
  elite: 10,
}

export interface ProviderUsageStatus {
  used: number
  limit: number | null
  extraCredits: number
}

function monthUtc(): string {
  return new Date().toISOString().slice(0, 7) // YYYY-MM
}

function msUntilNextUtcMonth(): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - now.getTime()
}

/* ── Redis helpers ─────────────────────────────────────────────── */

function redisKey(userId: number, provider: AiProvider): string {
  return `orch_provider:${userId}:${provider}:${monthUtc()}`
}

async function redisIncr(userId: number, provider: AiProvider): Promise<number | null> {
  if (!(await ensureRedisConnected())) return null
  try {
    const key = redisKey(userId, provider)
    const count = await redisClient!.incr(key)
    if (count === 1) await redisClient!.pexpire(key, msUntilNextUtcMonth())
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

/* ── SQLite helpers (orchestrator_monthly_usage, см. migration 050) ── */

function sqliteIncr(userId: number, provider: AiProvider): number {
  const month = monthUtc()
  const now = Date.now()
  db.exec("BEGIN IMMEDIATE")
  try {
    db.prepare(`
      INSERT INTO orchestrator_monthly_usage (user_id, provider, month_utc, count, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(user_id, provider, month_utc)
      DO UPDATE SET count = count + 1, updated_at = excluded.updated_at
    `).run(userId, provider, month, now)
    db.exec("COMMIT")
  } catch (e) {
    db.exec("ROLLBACK")
    throw e
  }
  const row: any = db.prepare(`
    SELECT count FROM orchestrator_monthly_usage WHERE user_id = ? AND provider = ? AND month_utc = ?
  `).get(userId, provider, month)
  return row?.count ?? 1
}

function sqliteGet(userId: number, provider: AiProvider): number {
  const row: any = db.prepare(`
    SELECT count FROM orchestrator_monthly_usage WHERE user_id = ? AND provider = ? AND month_utc = ?
  `).get(userId, provider, monthUtc())
  return row?.count ?? 0
}

/* ── extra_credits helpers (докупленные пакеты, см. migration 050) ── */

function getExtraCreditsBalance(userId: number, provider: AiProvider): number {
  const row: any = db
    .prepare(`SELECT balance FROM extra_credits WHERE user_id = ? AND provider = ?`)
    .get(userId, provider)
  return row?.balance ?? 0
}

function consumeExtraCredit(userId: number, provider: AiProvider): boolean {
  const result = db
    .prepare(`UPDATE extra_credits SET balance = balance - 1, updated_at = ? WHERE user_id = ? AND provider = ? AND balance > 0`)
    .run(Date.now(), userId, provider)
  return result.changes === 1
}

/* ── Public API ────────────────────────────────────────────────── */

/** Возвращает текущее использование провайдера за текущий месяц (без учёта extra_credits). */
export async function getProviderUsage(userId: number, provider: AiProvider): Promise<number> {
  if (process.env.NODE_ENV === "test") return 0
  const redis = await redisGet(userId, provider)
  return redis !== null ? redis : sqliteGet(userId, provider)
}

/**
 * true, если у пользователя не осталось ни месячной базовой квоты, ни докупленных
 * кредитов на этот провайдер (месячная база проверяется в первую очередь, кредиты — во вторую).
 */
export async function isProviderLimitExceeded(userId: number, plan: PlanKey, provider: AiProvider): Promise<boolean> {
  const limit = PROVIDER_MONTHLY_LIMITS[plan] ?? PROVIDER_MONTHLY_LIMITS.free
  if (limit === null) return false

  const used = await getProviderUsage(userId, provider)
  if (used < limit) return false

  return getExtraCreditsBalance(userId, provider) <= 0
}

/**
 * Списывает один вызов провайдера: сперва из месячной базовой квоты, если она ещё не
 * исчерпана, иначе — из extra_credits. Вызывать строго после успешного вызова провайдера
 * (см. паттерн isServiceBridgeLimitExceeded/incrementServiceBridgeUsage в orchestrator-nodes.ts).
 */
export async function incrementProviderUsage(userId: number, plan: PlanKey, provider: AiProvider): Promise<void> {
  if (process.env.NODE_ENV === "test") return

  const limit = PROVIDER_MONTHLY_LIMITS[plan] ?? PROVIDER_MONTHLY_LIMITS.free
  const used = await getProviderUsage(userId, provider)

  if (limit === null || used < limit) {
    const redisResult = await redisIncr(userId, provider)
    if (redisResult === null) sqliteIncr(userId, provider)
    return
  }

  consumeExtraCredit(userId, provider)
}

/** Детальная разбивка по одному провайдеру — для GET /orchestrator/usage-status. */
export async function getProviderUsageStatus(userId: number, plan: PlanKey, provider: AiProvider): Promise<ProviderUsageStatus> {
  const used = await getProviderUsage(userId, provider)
  const extraCredits = getExtraCreditsBalance(userId, provider)
  return { used, limit: PROVIDER_MONTHLY_LIMITS[plan] ?? PROVIDER_MONTHLY_LIMITS.free, extraCredits }
}
