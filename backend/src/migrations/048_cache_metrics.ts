import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 048: CACHE METRICS
   ================================================================
   Таблица hit/miss-статистики AgentCache (services/agents/cache.ts) —
   одна строка на каждый AgentCache.get() внутри BaseAgent.run()
   (services/agents/base-agent.ts), независимо от agent_executions (047,
   одна строка на сам execute()).

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runCacheMetricsMigration() {
  console.log("[migration:048] Starting cache_metrics migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS cache_metrics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name  TEXT NOT NULL,
      hit         INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cache_metrics_agent ON cache_metrics(agent_name);
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cache_metrics_created ON cache_metrics(created_at);
  `)

  console.log("[migration:048] cache_metrics migration complete.")
}

if (require.main === module) {
  runCacheMetricsMigration()
}
