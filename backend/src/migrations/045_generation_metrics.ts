import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 045: GENERATION METRICS
   ================================================================
   Таблица агрегируемых метрик по завершённым/упавшим/отменённым
   задачам ChainManager (services/chain-manager.ts). Пишется ОДИН раз
   при терминальном событии задачи (completed/failed/cancelled) —
   не путать с generation_tasks (044), которая хранит текущее
   состояние ЖИВОЙ задачи и перезаписывается на каждом шаге.

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runGenerationMetricsMigration() {
  console.log("[migration:045] Starting generation_metrics migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_metrics (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id          TEXT NOT NULL,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status           TEXT NOT NULL,
      duration_ms      INTEGER NOT NULL,
      steps_completed  INTEGER NOT NULL,
      steps_total      INTEGER NOT NULL,
      error            TEXT,
      created_at       INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generation_metrics_user ON generation_metrics(user_id);
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_generation_metrics_created ON generation_metrics(created_at);
  `)

  console.log("[migration:045] generation_metrics migration complete.")
}

if (require.main === module) {
  runGenerationMetricsMigration()
}
