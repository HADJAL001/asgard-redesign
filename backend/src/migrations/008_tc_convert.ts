import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 008: TC CONVERSION LOG (∞ ↔ TC резервный пул)
   ================================================================
   Таблица tc_convert_log хранит историю конвертаций между внутренней
   валютой ∞ (wallets.timecoin) и реальным SPL-токеном TC на Solana,
   выполненных через резервный пул (see src/lib/solana.ts).

   direction: 'to_tc'   — ∞ списано в БД, TC отправлен из резерва пользователю
              'from_tc' — TC получен резервом от пользователя, ∞ зачислено в БД
   ================================================================ */

export function runTcConvertMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tc_convert_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('to_tc', 'from_tc')),
      amount REAL NOT NULL,
      solana_address TEXT,
      tx_signature TEXT,
      status TEXT NOT NULL DEFAULT 'done',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tc_convert_user ON tc_convert_log(user_id);`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tc_convert_sig ON tc_convert_log(tx_signature) WHERE tx_signature IS NOT NULL;`)

  console.log("[migration:008] TC convert log migration complete.")
}

if (require.main === module) {
  runTcConvertMigration()
}
