import db from '../lib/db'

/* ================================================================
   OSGARD MIGRATION 013: WALLI STATS TABLE
   ================================================================
   Добавляет таблицу walli_stats для хранения игровой статистики:
   - level, skill, trash_collected, artifacts_found, rare_found
   - earned (∞ TC заработано за сбор мусора)
   - Авто-создаётся при первом обращении к /walli/stats
   ================================================================ */

export function runWalliStatsMigration() {
  console.log('[migration:013] Starting WALLI stats migration...')

  db.exec(`
    CREATE TABLE IF NOT EXISTS walli_stats (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL UNIQUE,
      level            INTEGER NOT NULL DEFAULT 1,
      skill            INTEGER NOT NULL DEFAULT 0  CHECK(skill BETWEEN 0 AND 100),
      trash_collected  INTEGER NOT NULL DEFAULT 0,
      artifacts_found  INTEGER NOT NULL DEFAULT 0,
      rare_found       INTEGER NOT NULL DEFAULT 0,
      earned           REAL    NOT NULL DEFAULT 0.0,
      xp               INTEGER NOT NULL DEFAULT 0,
      updated_at       INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_stats_user_id ON walli_stats(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_stats_level   ON walli_stats(level DESC);`)

  console.log('[migration:013] walli_stats table ensured')
  console.log('[migration:013] WALLI stats migration completed')
}

if (require.main === module) {
  runWalliStatsMigration()
}
