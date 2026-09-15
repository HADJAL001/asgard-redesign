import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 110: REMOVE DUO PLAN
   ================================================================
   Duo ($149/мес) был функциональным дублем Supreme ($99/мес) — обе
   квоты оркестратора (orchestratorProviderQuota.ts) были буквально
   идентичны, план различался только ценой. Продаж не было (подтверждено
   перед миграцией), поэтому ремап данных не нужен — только снятие
   CHECK-ограничения 'duo' из subscriptions.plan (SQLite не позволяет
   ALTER CHECK, поэтому таблица пересобирается, как в 050_plan_tiers.ts).

   Безопасна для повторного запуска.
   ================================================================ */

function subscriptionsNeedsRebuild(): boolean {
  const row = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'subscriptions'`)
    .get() as { sql: string } | undefined
  if (!row) return false
  return row.sql.includes("'duo'")
}

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
  console.log("[migration:110] Rebuilding subscriptions table without 'duo' plan...")

  const oldColumns = new Set(
    (db.prepare(`PRAGMA table_info(subscriptions)`).all() as { name: string }[]).map((c) => c.name),
  )
  const presentColumns = REBUILD_COLUMNS.filter((c) => oldColumns.has(c))

  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(`
      CREATE TABLE subscriptions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'supreme', 'elite')),
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
      /* duo не продавался, но на всякий случай ремапим на supreme, а не роняем строку —
         дешевле обработать гипотетический ряд, чем потерять подписку. */
      "CASE plan WHEN 'duo' THEN 'supreme' ELSE plan END",
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
    console.log("[migration:110] subscriptions table rebuilt without 'duo'.")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}

export function runRemoveDuoPlanMigration() {
  console.log("[migration:110] Starting remove-duo-plan migration...")

  if (subscriptionsNeedsRebuild()) {
    rebuildSubscriptionsTable()
  } else {
    console.log("[migration:110] subscriptions already without 'duo' — skip rebuild")
  }

  /* users.plan / trial_history.plan — TEXT без CHECK, ремап на всякий случай (duo не продавался). */
  db.exec(`UPDATE users SET plan = 'supreme' WHERE plan = 'duo';`)
  db.exec(`UPDATE trial_history SET plan = 'supreme' WHERE plan = 'duo';`)

  console.log("[migration:110] Remove-duo-plan migration complete.")
}

if (require.main === module) {
  runRemoveDuoPlanMigration()
}
