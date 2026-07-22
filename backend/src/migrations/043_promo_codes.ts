import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 043: PROMO CODES
   ================================================================
   Таблица promo_codes — хранит промокоды с ограничением на
   количество активаций, тип бонуса и срок действия.

   Таблица promo_redemptions — журнал применений: один пользователь
   может использовать один промокод только один раз (UNIQUE).

   Типы бонусов (type):
     - "timecoin"      — зачисляет amount TimeCoin на кошелёк
     - "trial_days"    — продлевает триал / даёт N дней доступа к плану
     - "discount_pct"  — процентная скидка на ближайший checkout (future)
   ================================================================ */

export function runPromoCodesMigration() {
  console.log("[migration:043] Starting promo codes migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      code          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      type          TEXT    NOT NULL CHECK(type IN ('timecoin', 'trial_days', 'discount_pct')),
      amount        INTEGER NOT NULL DEFAULT 0,
      plan          TEXT    NULL,
      max_uses      INTEGER NOT NULL DEFAULT 1,
      uses          INTEGER NOT NULL DEFAULT 0,
      expires_at    INTEGER NULL,
      created_by    INTEGER NULL REFERENCES users(id),
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      promo_id     INTEGER NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redeemed_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      UNIQUE(promo_id, user_id)
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes(code);
    CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user ON promo_redemptions(user_id);
  `)

  console.log("[migration:043] Promo codes migration complete.")
}

if (require.main === module) {
  runPromoCodesMigration()
}
