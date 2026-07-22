import db from "../lib/db"
import { ensureRedisConnected, redisClient } from "../lib/redis"
import { captureError } from "../lib/sentry"
import type { TaskStatusState } from "../types/pipeline.types"

/* ================================================================
   OSGARD · Метрики генерации проекта
   ----------------------------------------------------------------
   SQLite (generation_metrics, миграция 045) — источник истины,
   пишется синхронно при каждом терминальном событии ChainManager
   (completed/failed/cancelled). Redis-счётчики — best-effort кеш
   для быстрого дашборда (INCR без TTL), НЕ обязательная зависимость:
   если REDIS_URL не задан или соединение недоступно, просто
   пропускаются (см. lib/redis.ts — тот же контракт, что и везде
   в проекте). Ошибка Redis никогда не должна ронять сам pipeline.
   ================================================================ */

export interface TrackGenerationParams {
  taskId: string
  userId: number
  status: Extract<TaskStatusState, "completed" | "failed" | "cancelled">
  durationMs: number
  stepsCompleted: number
  stepsTotal: number
  error?: string
}

export async function trackGeneration(params: TrackGenerationParams): Promise<void> {
  try {
    db.prepare(
      `INSERT INTO generation_metrics (task_id, user_id, status, duration_ms, steps_completed, steps_total, error, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      params.taskId,
      params.userId,
      params.status,
      params.durationMs,
      params.stepsCompleted,
      params.stepsTotal,
      params.error ?? null,
      Date.now(),
    )
  } catch (err) {
    // SQLite-запись метрики не должна ронять сам pipeline — только логируем.
    captureError("[generation-metrics] failed to persist metric:", err)
  }

  try {
    const connected = await ensureRedisConnected()
    if (connected && redisClient) {
      await redisClient.incr("metrics:generations:total")
      await redisClient.incr(`metrics:generations:${params.status}`)
    }
  } catch (err) {
    console.warn("[generation-metrics] redis increment skipped:", (err as Error)?.message)
  }
}

export interface GenerationMetricsSummary {
  total: number
  completed: number
  failed: number
  cancelled: number
  avgDurationMs: number
}

/** Агрегированная сводка из SQLite (источник истины) — для админ-дашборда. */
export function getGenerationMetricsSummary(): GenerationMetricsSummary {
  const row: any = db
    .prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
         SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
         AVG(duration_ms) as avg_duration_ms
       FROM generation_metrics`,
    )
    .get()

  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    failed: row?.failed ?? 0,
    cancelled: row?.cancelled ?? 0,
    avgDurationMs: Math.round(row?.avg_duration_ms ?? 0),
  }
}
