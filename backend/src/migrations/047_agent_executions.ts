import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 047: AGENT EXECUTIONS
   ================================================================
   Таблица метрик по каждому вызову агента пайплайна Backend/Tester/
   Optimizer/Security (services/agents/*) — в отличие от
   generation_metrics (045, одна строка на ЗАВЕРШЁННУЮ задачу
   ChainManager целиком), здесь одна строка на каждый отдельный
   agent.run() (services/agents/metrics.ts).

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runAgentExecutionsMigration() {
  console.log("[migration:047] Starting agent_executions migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_executions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name  TEXT NOT NULL,
      success     INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      task_id     TEXT,
      created_at  INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_executions_agent ON agent_executions(agent_name);
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_executions_created ON agent_executions(created_at);
  `)

  console.log("[migration:047] agent_executions migration complete.")
}

if (require.main === module) {
  runAgentExecutionsMigration()
}
