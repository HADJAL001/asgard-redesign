import * as Sentry from "@sentry/nextjs"

/* ================================================================
   OSGARD · Sentry (веб)
   ----------------------------------------------------------------
   Тот же паттерн, что backend/src/lib/sentry.ts: без DSN — no-op,
   ничего никуда не отправляется и сборка/дев не требует Sentry.
   ================================================================ */

/** Логирует в консоль и отправляет в Sentry (no-op, если DSN не задан). */
export function captureError(context: string, err: unknown) {
  console.error(context, err)
  Sentry.captureException(err)
}

export { Sentry }
