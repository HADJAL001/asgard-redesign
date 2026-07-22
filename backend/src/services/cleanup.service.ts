import db from "../lib/db"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · Очистка старых задач генерации проекта
   ----------------------------------------------------------------
   Удаляет из generation_tasks (миграция 044) строки в терминальном
   статусе (completed/failed/cancelled), старше GENERATION_TASK_RETENTION_DAYS
   дней (по умолчанию 7). Активные задачи (queued/processing) никогда
   не трогает. Метрики (generation_metrics, миграция 045) НЕ чистятся —
   это агрегируемая история для дашборда, а не рабочее состояние.

   Периодичность — module-level setInterval без .unref()/явной остановки,
   тот же стиль, что и у middleware/rateLimiter.ts (единственный
   прецедент периодической фоновой очистки в этом кодбейзе).
   ================================================================ */

const RETENTION_MS = Number(process.env.GENERATION_TASK_RETENTION_DAYS || 7) * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

export function cleanOldGenerationTasks(): number {
  try {
    const cutoff = Date.now() - RETENTION_MS
    const result = db
      .prepare(
        `DELETE FROM generation_tasks WHERE status IN ('completed', 'failed', 'cancelled') AND updated_at < ?`,
      )
      .run(cutoff)
    const deleted = Number(result.changes ?? 0)
    if (deleted > 0) {
      console.log(`[cleanup] Удалено ${deleted} старых задач генерации (старше ${RETENTION_MS / 86_400_000} дн.)`)
    }
    return deleted
  } catch (err) {
    captureError("[cleanup] failed to clean old generation tasks:", err)
    return 0
  }
}

setInterval(cleanOldGenerationTasks, CLEANUP_INTERVAL_MS)
