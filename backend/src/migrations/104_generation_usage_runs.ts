import db from "../lib/db"

db.exec(`
  CREATE TABLE IF NOT EXISTS generation_usage_runs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id        INTEGER NOT NULL,
    user_id           INTEGER NOT NULL,
    kind              TEXT NOT NULL CHECK(kind IN ('generation', 'refinement', 'repair')),
    depth             TEXT NOT NULL CHECK(depth IN ('quick', 'standard', 'deep')),
    attempt           INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
    ai_calls          INTEGER NOT NULL DEFAULT 0,
    tokens_in         INTEGER NOT NULL DEFAULT 0,
    tokens_out        INTEGER NOT NULL DEFAULT 0,
    duration_ms       INTEGER NOT NULL DEFAULT 0,
    meter             TEXT,
    started_at        INTEGER NOT NULL,
    finished_at       INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_generation_usage_project
    ON generation_usage_runs(project_id, kind, id);
  CREATE INDEX IF NOT EXISTS idx_generation_usage_started
    ON generation_usage_runs(started_at DESC);
`)

/* A process restart interrupts an in-flight attempt. Keeping it as `running` forever
 * would make the live budget report lie; the durable worker records a new attempt if
 * it retries the project after startup. */
db.prepare(
  `UPDATE generation_usage_runs
      SET status = 'failed', finished_at = COALESCE(finished_at, ?)
    WHERE status = 'running'`,
).run(Date.now())
