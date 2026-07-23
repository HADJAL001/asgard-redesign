import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 062: восстановление таблицы referrals
   ----------------------------------------------------------------
   Таблица `referrals` (referrer_id, referee_id, reward_amount, status)
   исторически создавалась вручную, отдельной миграцией, которая позже
   была удалена из репозитория (см. комментарий в 002_referral_system.ts,
   строки 46-49) — сама таблица нигде в кодовой базе больше не создаётся.
   На существующей локальной БД она есть, но на свежей (чистый деплой,
   пересозданная эфемерная SQLite на Railway, тестовая БД) — её нет:

   - POST /auth/register с referralCode: молча проглатывает ошибку
     (try/catch в auth.controller.ts), но лог начисления рефереру теряется.
   - GET /referral/stats: без try/catch — падает с необработанной
     "no such table: referrals" → сырая 500-ошибка на странице /referral.

   Схема ниже — точная копия исторической (сверено с sqlite_master.sql
   на боевой локальной БД), просто оформленная как идемпотентная миграция.
   ================================================================ */

export function runReferralsTableMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS referrals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        referrer_id INTEGER NOT NULL,
        referee_id INTEGER NOT NULL,
        reward_amount INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (referee_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(referrer_id, referee_id)
      )
    `)
  } catch (e: any) {
    console.warn(`[migration:062] Skipping referrals table: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)`)
  } catch (e: any) {
    console.warn(`[migration:062] Skipping idx_referrals_referrer: ${e.message}`)
  }
}

if (require.main === module) {
  runReferralsTableMigration()
}
