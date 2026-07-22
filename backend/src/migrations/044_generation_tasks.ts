import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 044: GENERATION TASKS
   ================================================================
   Таблица для ChainManager (services/chain-manager.ts) — хранит
   статус/прогресс/артефакты цепочки генерации проекта, запущенной
   через POST /api/generate-project.

   id — TEXT (crypto.randomUUID()), а не autoincrement, т.к. taskId
   определён как string в общем контракте types/pipeline.types.ts,
   используемом другими агентами пайплайна.

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runGenerationTasksMigration() {
  console.log("[migration:044] Starting generation_tasks migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_tasks (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status       TEXT NOT NULL DEFAULT 'queued',
      progress     INTEGER NOT NULL DEFAULT 0,
      current_step TEXT NOT NULL DEFAULT '',
      input        TEXT NOT NULL,
      artifacts    TEXT NOT NULL DEFAULT '[]',
      result       TEXT,
      error        TEXT,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generation_tasks_user ON generation_tasks(user_id);
  `)

  console.log("[migration:044] generation_tasks migration complete.")
}

if (require.main === module) {
  runGenerationTasksMigration()
}
