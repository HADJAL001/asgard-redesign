import db from "../../lib/db"
import { captureError } from "../../lib/sentry"

/* ================================================================
   OSGARD · AgentMetrics
   ----------------------------------------------------------------
   Пишет одну строку в agent_executions (миграция 047) на каждый
   вызов agent.run() (base-agent.ts) — независимо от generation-
   metrics.service.ts, который считает метрики на уровне целой
   задачи ChainManager, а не отдельного агента.
   Как и generation-metrics.service.ts: ошибка записи метрики не
   должна ронять сам pipeline — только логируется.
   ================================================================ */

export const AgentMetrics = {
  track(agentName: string, success: boolean, durationMs: number, taskId?: string): void {
    try {
      db.prepare(
        `INSERT INTO agent_executions (agent_name, success, duration_ms, task_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(agentName, success ? 1 : 0, durationMs, taskId ?? null, Date.now())
    } catch (err) {
      captureError("[agent-metrics] failed to persist execution:", err)
    }
  },

  /** Одна строка в cache_metrics (миграция 048) на каждый AgentCache.get()
   *  внутри BaseAgent.run() — hit=true/false, сколько заняла сама проверка кеша. */
  trackCache(agentName: string, hit: boolean, durationMs: number): void {
    try {
      db.prepare(
        `INSERT INTO cache_metrics (agent_name, hit, duration_ms, created_at)
         VALUES (?, ?, ?, ?)`,
      ).run(agentName, hit ? 1 : 0, durationMs, Date.now())
    } catch (err) {
      captureError("[agent-metrics] failed to persist cache metric:", err)
    }
  },
}

export interface CacheMetricsSummary {
  agentName: string
  total: number
  hits: number
  misses: number
  hitRate: number
  avgDurationMs: number
}

/** Агрегированная hit/miss-сводка по каждому агенту — для админ-дашборда. */
export function getCacheMetricsSummary(): CacheMetricsSummary[] {
  const rows = db
    .prepare(
      `SELECT
         agent_name,
         COUNT(*) as total,
         SUM(CASE WHEN hit = 1 THEN 1 ELSE 0 END) as hits,
         SUM(CASE WHEN hit = 0 THEN 1 ELSE 0 END) as misses,
         AVG(duration_ms) as avg_duration_ms
       FROM cache_metrics
       GROUP BY agent_name`,
    )
    .all() as any[]

  return rows.map((row) => ({
    agentName: row.agent_name,
    total: row.total,
    hits: row.hits,
    misses: row.misses,
    hitRate: row.total > 0 ? Math.round((row.hits / row.total) * 100) / 100 : 0,
    avgDurationMs: Math.round(row.avg_duration_ms ?? 0),
  }))
}

export interface AgentMetricsSummary {
  agentName: string
  total: number
  succeeded: number
  failed: number
  avgDurationMs: number
}

/** Агрегированная сводка по каждому агенту из SQLite — для админ-дашборда. */
export function getAgentMetricsSummary(): AgentMetricsSummary[] {
  const rows = db
    .prepare(
      `SELECT
         agent_name,
         COUNT(*) as total,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as succeeded,
         SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed,
         AVG(duration_ms) as avg_duration_ms
       FROM agent_executions
       GROUP BY agent_name`,
    )
    .all() as any[]

  return rows.map((row) => ({
    agentName: row.agent_name,
    total: row.total,
    succeeded: row.succeeded,
    failed: row.failed,
    avgDurationMs: Math.round(row.avg_duration_ms ?? 0),
  }))
}
