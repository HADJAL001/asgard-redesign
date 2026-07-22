import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 042: TRIAL
   ================================================================
   Добавляет в таблицу subscriptions:
   - trial_used INTEGER DEFAULT 0 — флаг: пользователь уже воспользовался
     бесплатным 7-дневным триалом (1 раз на аккаунт, per-plan).

   Безопасна для повторного запуска: проверяем наличие колонки через
   PRAGMA table_info перед ALTER TABLE.
   ================================================================ */

type ColumnInfo = { name: string }

function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  return columns.some((c) => c.name === column)
}

export function runTrialMigration() {
  console.log("[migration:042] Starting trial migration...")

  if (!hasColumn("subscriptions", "trial_used")) {
    db.exec(`ALTER TABLE subscriptions ADD COLUMN trial_used INTEGER NOT NULL DEFAULT 0`)
    console.log("[migration:042] Added subscriptions.trial_used")
  } else {
    console.log("[migration:042] subscriptions.trial_used already exists — skip")
  }

  /* Отдельная таблица trial_history — хранит историю триалов по (user_id, plan),
     позволяет запретить повторный триал на один и тот же план. */
  db.exec(`
    CREATE TABLE IF NOT EXISTS trial_history (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan      TEXT    NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      ends_at   INTEGER NOT NULL,
      UNIQUE(user_id, plan)
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_trial_history_user ON trial_history(user_id);
  `)

  console.log("[migration:042] Trial migration complete.")
}

if (require.main === module) {
  runTrialMigration()
}
