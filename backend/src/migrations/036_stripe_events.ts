import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 036: идемпотентность Stripe webhook
   ----------------------------------------------------------------
   stripe_events — журнал уже обработанных event.id. Stripe гарантированно
   повторяет доставку webhook при таймауте/5xx/сетевой ошибке — без
   дедупликации по event.id это задваивало бы транзакции и апдейты
   подписки в subscription.routes.ts.
   ================================================================ */

export function runStripeEventsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)
}

runStripeEventsMigration()
