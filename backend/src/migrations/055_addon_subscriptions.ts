import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 055: ADDON SUBSCRIPTIONS (ДЖАРВИС / ВАЛЛИ Premium)
   ================================================================
   Параллельная (НЕ иерархическая) система подписок на AI-продукты
   ДЖАРВИС и ВАЛЛИ — независимая от основных тарифов (PlanKey).

   addon_subscriptions — биллинг-состояние премиум-доступа к продукту.
   addon_key: 'jarvis_premium' | 'walli_premium' — единственные
   покупаемые ключи (оба фиксированы по цене $99/мес, без скидок за
   бандл). Более высокий статус 'elite' НЕ продаётся отдельно — это
   прогресс-статус внутри addon_progress (миграция 056), достигаемый
   через XP/достижения при активной premium-подписке.

   Структура полей зеркалит таблицу subscriptions (см. migration 004)
   для единообразия обработки Stripe webhook/checkout/cancel.

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runAddonSubscriptionsMigration() {
  console.log("[migration:055] Starting addon_subscriptions migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS addon_subscriptions (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                 INTEGER NOT NULL,
      addon_key               TEXT NOT NULL CHECK(addon_key IN ('jarvis_premium','walli_premium')),
      status                  TEXT NOT NULL DEFAULT 'inactive'
                              CHECK(status IN ('active','trialing','past_due','canceled','unpaid','inactive')),
      stripe_customer_id      TEXT,
      stripe_subscription_id  TEXT,
      stripe_price_id         TEXT,
      current_period_start    INTEGER,
      current_period_end      INTEGER,
      cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
      canceled_at             INTEGER,
      created_at              INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at              INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, addon_key)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_user ON addon_subscriptions(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_status ON addon_subscriptions(status);`)

  console.log("[migration:055] addon_subscriptions migration complete.")
}

if (require.main === module) {
  runAddonSubscriptionsMigration()
}
