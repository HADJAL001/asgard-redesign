import * as Sentry from "@sentry/nextjs"

/* ================================================================
   OSGARD · Sentry (сервер/edge)
   ----------------------------------------------------------------
   Тот же паттерн, что backend/src/lib/sentry.ts: без SENTRY_DSN —
   no-op (SDK сам ничего не отправляет), процесс не падает и не
   требует Sentry для локальной разработки.
   ================================================================ */

export function register() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    console.warn("[sentry] SENTRY_DSN не задан — серверные ошибки не будут отправляться в Sentry")
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  })
}

export const onRequestError = Sentry.captureRequestError
