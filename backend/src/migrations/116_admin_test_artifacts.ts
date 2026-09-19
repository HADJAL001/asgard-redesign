import db from "../lib/db"

/** Separates disposable administrator fixtures from the user-owned economy. */
export function runAdminTestArtifactsMigration() {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'artifacts'`).get()
  if (!exists) return
  const columns = db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === "is_test")) {
    db.prepare(`ALTER TABLE artifacts ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0`).run()
  }
  if (!columns.some((column) => column.name === "test_created_by")) {
    db.prepare(`ALTER TABLE artifacts ADD COLUMN test_created_by INTEGER REFERENCES users(id)`).run()
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_artifacts_test_created ON artifacts(is_test, created_at);
    CREATE TRIGGER IF NOT EXISTS trg_test_artifact_no_listing
    BEFORE UPDATE OF status ON artifacts
    WHEN OLD.is_test = 1 AND NEW.status = 'listed'
    BEGIN SELECT RAISE(ABORT, 'Test artifacts are soulbound'); END;
  `)
}
