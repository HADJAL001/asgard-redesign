import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 050: PLAN TIERS (5-уровневая тарифная сетка)
   ================================================================
   Полная замена ключей плана: architect/master/legend → free/pro/supreme/duo/elite.

   1. subscriptions.plan/status имеют CHECK — SQLite не позволяет ALTER CHECK,
      поэтому таблица пересобирается (rebuild) с ремапом данных.
   2. users.plan и trial_history.plan — обычный TEXT без CHECK, простой UPDATE-ремап.
   3. Новые таблицы: orchestrator_monthly_usage, extra_credits, extra_package_purchases —
      квоты оркестратора по провайдерам (месяц) и докупаемые пакеты (не сгорают).

   Безопасна для повторного запуска.
   ================================================================ */

function subscriptionsNeedsRebuild(): boolean {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subscriptions'`)
    .get() as { sql: string } | undefined
  if (!row) return false
  return !row.sql.includes("'elite'")
}

/** Колонки subscriptions, добавленные в CREATE TABLE IF NOT EXISTS уже после
 *  того, как таблица была впервые создана в некоторых БД (IF NOT EXISTS не
 *  бэкфиллит недостающие колонки в существующую таблицу, а не для всех из
 *  них была написана отдельная ALTER-миграция, в отличие от trial_used —
 *  см. 042_trial.ts). Список колонок старой таблицы читаем динамически, а
 *  не полагаемся на фиксированный набор, чтобы rebuild не падал на "no such
 *  column" независимо от того, насколько отстала конкретная БД. Легаси-
 *  колонки старой таблицы, которых нет в этом списке (например expires_at —
 *  не используется нигде в коде, см. promo_codes.expires_at — другая
 *  таблица), при rebuild-е намеренно отбрасываются.
 */
const REBUILD_COLUMNS = [
  "stripe_customer_id",
  "stripe_subscription_id",
  "stripe_price_id",
  "current_period_start",
  "current_period_end",
  "cancel_at_period_end",
  "canceled_at",
  "trial_used",
  "created_at",
  "updated_at",
] as const

function rebuildSubscriptionsTable() {
  console.log("[migration:050] Rebuilding subscriptions table with new plan CHECK...")

  const oldColumns = new Set(
    (db.prepare(`PRAGMA table_info(subscriptions)`).all() as { name: string }[]).map((c) => c.name),
  )
  const presentColumns = REBUILD_COLUMNS.filter((c) => oldColumns.has(c))
  const missingColumns = REBUILD_COLUMNS.filter((c) => !oldColumns.has(c))
  if (missingColumns.length > 0) {
    console.log(`[migration:050] Old subscriptions table missing columns (will default): ${missingColumns.join(", ")}`)
  }

  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(`
      CREATE TABLE subscriptions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'supreme', 'duo', 'elite')),
        status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN (
          'inactive', 'active', 'trialing', 'past_due', 'canceled', 'unpaid'
        )),
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        stripe_price_id TEXT,
        current_period_start INTEGER,
        current_period_end INTEGER,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        canceled_at INTEGER,
        trial_used INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
    `)

    const insertColumns = ["id", "user_id", "plan", "status", ...presentColumns]
    const selectColumns = [
      "id",
      "user_id",
      "CASE plan WHEN 'architect' THEN 'pro' WHEN 'master' THEN 'supreme' WHEN 'legend' THEN 'elite' ELSE plan END",
      "status",
      ...presentColumns,
    ]

    db.exec(`
      INSERT INTO subscriptions_new (${insertColumns.join(", ")})
      SELECT ${selectColumns.join(", ")}
      FROM subscriptions;
    `)

    db.exec(`DROP TABLE subscriptions;`)
    db.exec(`ALTER TABLE subscriptions_new RENAME TO subscriptions;`)

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
    `)

    db.exec("COMMIT")
    console.log("[migration:050] subscriptions table rebuilt.")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

export function runPlanTiersMigration() {
  console.log("[migration:050] Starting plan tiers migration...")

  /* ---------------- 1. subscriptions.plan (CHECK rebuild) ---------------- */
  if (subscriptionsNeedsRebuild()) {
    rebuildSubscriptionsTable()
  } else {
    console.log("[migration:050] subscriptions already on new plan CHECK — skip rebuild")
  }

  /* ---------------- 2. users.plan (простой ремап, без CHECK) ---------------- */
  db.exec(`
    UPDATE users SET plan = CASE plan
      WHEN 'architect' THEN 'pro'
      WHEN 'master' THEN 'supreme'
      WHEN 'legend' THEN 'elite'
      ELSE plan
    END
    WHERE plan IN ('architect', 'master', 'legend');
  `)

  /* ---------------- 3. trial_history.plan (простой ремап, без CHECK) ---------------- */
  db.exec(`
    UPDATE trial_history SET plan = CASE plan
      WHEN 'architect' THEN 'pro'
      WHEN 'master' THEN 'supreme'
      WHEN 'legend' THEN 'elite'
      ELSE plan
    END
    WHERE plan IN ('architect', 'master', 'legend');
  `)

  /* ---------------- 4. orchestrator_monthly_usage (квота оркестратора по провайдерам/месяцу) ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrator_monthly_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('claude', 'grok', 'deepseek')),
      month_utc TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      UNIQUE(user_id, provider, month_utc)
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_orchestrator_monthly_usage_user ON orchestrator_monthly_usage(user_id, month_utc);
  `)

  /* ---------------- 5. extra_credits (докупленные пакеты — rolling, не сгорают) ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS extra_credits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('claude', 'grok', 'deepseek')),
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      UNIQUE(user_id, provider)
    );
  `)

  /* ---------------- 6. extra_package_purchases (журнал покупок, идемпотентность по сессии) ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS extra_package_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL CHECK (provider IN ('claude', 'grok', 'deepseek')),
      amount INTEGER NOT NULL,
      stripe_session_id TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_extra_package_purchases_user ON extra_package_purchases(user_id);
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_extra_package_purchases_session
      ON extra_package_purchases(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
  `)

  console.log("[migration:050] Plan tiers migration complete.")
}

if (require.main === module) {
  runPlanTiersMigration()
}
