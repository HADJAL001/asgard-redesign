import * as Sentry from "@sentry/node"

/* ================================================================
   OSGARD · Sentry
   ----------------------------------------------------------------
   Инициализируется лениво-безопасно: если SENTRY_DSN не задан, SDK
   просто ничего никуда не отправляет (no-op), процесс не падает и
   не требует Sentry для локальной разработки. Импортировать и звать
   init() нужно ДО остальных импортов server.ts, чтобы автотрейсинг
   Sentry успел проинструментировать express/http до их создания.
   ================================================================ */

export function initSentry() {
  const dsn = process.env.SENTRY_DSN
  if (!dsn) {
    console.warn("[sentry] SENTRY_DSN не задан — ошибки не будут отправляться в Sentry")
    return
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  })
}

/** Логирует в консоль и отправляет в Sentry (no-op на Sentry, если DSN не задан). */
export function captureError(context: string, err: unknown) {
  console.error(context, err)
  Sentry.captureException(err)
}

export { Sentry }
