import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 007: таблица feedback (обратная связь / чат с создателем)
   ================================================================ */

export function runFeedbackMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      created_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
  `)
}

runFeedbackMigration()
