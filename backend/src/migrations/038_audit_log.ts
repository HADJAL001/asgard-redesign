import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 038: журнал финансовых операций (audit_log)
   ----------------------------------------------------------------
   В отличие от transactions (пользовательская история для UI),
   audit_log — служебный журнал для расследований и обнаружения
   злоупотреблений: фиксирует списания/начисления И отклонённые
   попытки (402/429/400 по причине лимитов/баланса), которые в
   transactions не попадают вовсе, так как относятся к операциям,
   не состоявшимся по бизнес-логике.
   ================================================================ */

export function runAuditLogMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      meta TEXT,
      created_at INTEGER NOT NULL
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON audit_log(user_id, created_at);`)
}

runAuditLogMigration()
