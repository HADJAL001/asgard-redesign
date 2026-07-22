import { captureError } from "../../lib/sentry"

/* ================================================================
   OSGARD · Integration Logger
   ----------------------------------------------------------------
   Лёгкое структурированное логирование деплоев/публикаций без новой
   БД-схемы: у проекта нет Prisma (только better-sqlite3 + сырой SQL,
   см. миграции в backend/src/migrations/), заводить под это отдельную
   таблицу и ORM — избыточно для того, что нужно (видеть в логах/Sentry,
   что и почему упало). Ошибки уходят в captureError (Sentry), как и
   во всех остальных сервисах.
   ================================================================ */

export type IntegrationPlatform = "vercel" | "github"

export function logIntegrationEvent(
  platform: IntegrationPlatform,
  success: boolean,
  durationMs: number,
  error?: unknown,
) {
  const line = `[integrations:${platform}] ${success ? "OK" : "FAILED"} in ${durationMs}ms`

  if (success) {
    console.log(line)
    return
  }

  console.error(line)
  captureError(`[integrations:${platform}] failed:`, error)
}
