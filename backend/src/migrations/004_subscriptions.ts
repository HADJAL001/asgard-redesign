import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 004: SUBSCRIPTIONS (STRIPE)
   ================================================================
   Добавляет:
   - таблица subscriptions      — состояние подписки пользователя,
     привязанное к Stripe Customer/Subscription/Price
   - users.plan                 — текущий активный план пользователя
     (free / architect / master / legend), для быстрых проверок без JOIN

   Безопасна для повторного запуска: IF NOT EXISTS / проверка колонок
   через PRAGMA table_info перед ALTER TABLE.
   ================================================================ */

type ColumnInfo = { name: string }

function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  return columns.some((c) => c.name === column)
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    console.log(`[migration:004] Added column ${table}.${column}`)
  } else {
    console.log(`[migration:004] Column ${table}.${column} already exists — skip`)
  }
}

export function runSubscriptionsMigration() {
  console.log("[migration:004] Starting subscriptions migration...")

  /* ---------------- 1. Колонка users.plan ---------------- */
  addColumnIfMissing("users", "plan", "TEXT NOT NULL DEFAULT 'free'")

  /* ---------------- 2. Таблица subscriptions ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'architect', 'master', 'legend')),
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
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON subscriptions(stripe_subscription_id);
  `)

  console.log("[migration:004] Subscriptions migration complete.")
}

/* Позволяет запускать миграцию напрямую: `tsx src/migrations/004_subscriptions.ts` */
if (require.main === module) {
  runSubscriptionsMigration()
}
