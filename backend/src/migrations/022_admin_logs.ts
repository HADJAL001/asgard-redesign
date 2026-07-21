import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 022: журнал действий админки (admin_logs)
   ================================================================ */

export function runAdminLogsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_user_id INTEGER,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at);
  `)
}

runAdminLogsMigration()
