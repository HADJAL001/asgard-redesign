import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 002: REFERRAL SYSTEM
   ================================================================
   Добавляет:
   - users.referral_code       — уникальный код текущего пользователя
   - users.referred_by         — id пользователя-пригласителя (nullable)
   - users.onboarding_step     — прогресс онбординга (0..5)
   - таблица referrals         — журнал начислений по рефералке

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
    console.log(`[migration:002] Added column ${table}.${column}`)
  } else {
    console.log(`[migration:002] Column ${table}.${column} already exists — skip`)
  }
}

/** Генерирует короткий человекочитаемый реферальный код на основе id пользователя. */
function generateReferralCode(userId: number): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase()
  return `OSG${userId.toString(36).toUpperCase()}${rand}`
}

export function runReferralMigration() {
  console.log("[migration:002] Starting referral system migration...")

  /* ---------------- 1. Колонки в users ---------------- */
  addColumnIfMissing("users", "referral_code", "TEXT")
  addColumnIfMissing("users", "referred_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL")
  addColumnIfMissing("users", "onboarding_step", "INTEGER NOT NULL DEFAULT 0")

  /* ---------------- 2. Таблица referrals (журнал начислений) ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL DEFAULT 'signup' CHECK (kind IN ('signup', 'reward', 'purchase')),
      amount_credits REAL NOT NULL DEFAULT 0,
      amount_tc REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
    CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
  `)

  /* ---------------- 3. Бэкофилл referral_code для существующих пользователей ---------------- */
  const usersWithoutCode = db
    .prepare(`SELECT id FROM users WHERE referral_code IS NULL OR referral_code = ''`)
    .all() as { id: number }[]

  if (usersWithoutCode.length > 0) {
    const update = db.prepare(`UPDATE users SET referral_code = ? WHERE id = ?`)
    for (const u of usersWithoutCode) {
      let code = generateReferralCode(u.id)
      // на случай коллизии — перегенерируем
      while (db.prepare(`SELECT id FROM users WHERE referral_code = ?`).get(code)) {
        code = generateReferralCode(u.id)
      }
      update.run(code, u.id)
    }
    console.log(`[migration:002] Backfilled referral_code for ${usersWithoutCode.length} user(s)`)
  }

  console.log("[migration:002] Referral system migration complete.")
}

/* Позволяет запускать миграцию напрямую: `tsx src/migrations/002_referral_system.ts` */
if (require.main === module) {
  runReferralMigration()
}
