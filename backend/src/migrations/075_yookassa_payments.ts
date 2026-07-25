import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 075: таблица yookassa_payments
   ----------------------------------------------------------------
   Учёт и ИДЕМПОТЕНТНОСТЬ платежей ЮKassa. Первичный ключ — id платежа
   ЮKassa (строка). Webhook ЮKassa доставляется повторно при таймауте/
   5xx на нашей стороне, поэтому активацию подписки проводим ровно один
   раз: атомарный UPDATE ... WHERE status != 'succeeded' исключает
   повторное начисление (аналог stripe_events для Stripe).
   ================================================================ */

export function runYookassaPaymentsMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS yookassa_payments (
        id            TEXT PRIMARY KEY,
        user_id       INTEGER NOT NULL,
        plan          TEXT NOT NULL,
        amount_rub    REAL NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_yookassa_payments_user_id ON yookassa_payments(user_id);`)
  } catch (e: any) {
    console.warn(`[migration:075] Skipping yookassa_payments: ${e.message}`)
  }
}

runYookassaPaymentsMigration()
