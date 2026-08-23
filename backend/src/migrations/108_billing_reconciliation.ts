import db from "../lib/db"

db.exec(`
  CREATE TABLE IF NOT EXISTS billing_reconciliation_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL CHECK(status IN ('ok', 'warning', 'error')),
    checked_count INTEGER NOT NULL DEFAULT 0,
    issue_count INTEGER NOT NULL DEFAULT 0,
    report_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_billing_reconciliation_created
    ON billing_reconciliation_runs(created_at DESC);
`)
