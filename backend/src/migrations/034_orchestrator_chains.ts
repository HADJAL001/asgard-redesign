import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 034: AI-оркестратор «Python Snake»
   ----------------------------------------------------------------
   orchestrator_chains — сохранённые пользователем цепочки узлов
   (граф в виде сериализованного JSON nodes/edges, как в React Flow).
   orchestrator_executions — история запусков цепочки: статус, вход/
   выход, статус каждого узла (для SSE-восстановления при реконнекте),
   списанная стоимость.
   ================================================================ */

export function runOrchestratorChainsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrator_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_public INTEGER NOT NULL DEFAULT 0,
      price_tc REAL NOT NULL DEFAULT 0,
      nodes TEXT NOT NULL,
      edges TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrator_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      input TEXT,
      output TEXT,
      node_statuses TEXT NOT NULL DEFAULT '[]',
      cost_tc REAL NOT NULL DEFAULT 0,
      error TEXT,
      started_at INTEGER,
      finished_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chain_id) REFERENCES orchestrator_chains(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_chains_user ON orchestrator_chains(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_exec_chain ON orchestrator_executions(chain_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orch_exec_user ON orchestrator_executions(user_id);`)
}

runOrchestratorChainsMigration()
