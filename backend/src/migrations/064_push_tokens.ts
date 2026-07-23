import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 064: таблица push_tokens
   ----------------------------------------------------------------
   Push-токены Expo (mobile/lib/push.ts), по одному на установку
   приложения. POST /push/register делает upsert по token, чтобы
   переустановка/повторная регистрация не плодила дубликаты.
   ================================================================ */

export function runPushTokensMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS push_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT NOT NULL,
        platform TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
  } catch (e: any) {
    console.warn(`[migration:064] Skipping push_tokens table: ${e.message}`)
  }
  try {
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token)`)
  } catch (e: any) {
    console.warn(`[migration:064] Skipping idx_push_tokens_token: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)`)
  } catch (e: any) {
    console.warn(`[migration:064] Skipping idx_push_tokens_user: ${e.message}`)
  }
}

if (require.main === module) {
  runPushTokensMigration()
}
