import db from "../lib/db"

/** Durable queue for the user-facing project generator. */
export function runProjectGenerationJobsMigration(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_generation_jobs (
      project_id     INTEGER PRIMARY KEY,
      user_id        INTEGER NOT NULL,
      payload        TEXT NOT NULL,
      refinement_id  INTEGER,
      status         TEXT NOT NULL DEFAULT 'queued',
      attempts       INTEGER NOT NULL DEFAULT 0,
      available_at   INTEGER NOT NULL DEFAULT 0,
      lease_until    INTEGER,
      lease_token    TEXT,
      last_error     TEXT,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (refinement_id) REFERENCES project_refinements(id) ON DELETE SET NULL
    );
  `)

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(project_generation_jobs)`).all() as Array<{ name: string }>).map((column) => column.name),
  )
  if (!columns.has("available_at")) {
    db.exec(`ALTER TABLE project_generation_jobs ADD COLUMN available_at INTEGER NOT NULL DEFAULT 0`)
  }
  if (!columns.has("lease_token")) {
    db.exec(`ALTER TABLE project_generation_jobs ADD COLUMN lease_token TEXT`)
  }

  // Recreate the index so databases that briefly ran the first version of 099
  // receive the same claim ordering as fresh installations.
  db.exec(`
    DROP INDEX IF EXISTS idx_project_generation_jobs_claim;
    CREATE INDEX idx_project_generation_jobs_claim
      ON project_generation_jobs(status, available_at, lease_until, created_at);
  `)
}

runProjectGenerationJobsMigration()
