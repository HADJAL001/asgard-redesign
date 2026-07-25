import * as Sentry from "@sentry/nextjs"

/* ================================================================
   OSGARD · Sentry (браузер)
   ----------------------------------------------------------------
   Тот же паттерн, что instrumentation.ts: без DSN — no-op.
   NEXT_PUBLIC_ префикс обязателен — переменная попадает в клиентский
   бандл.
   ================================================================ */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  })
} else if (process.env.NODE_ENV === "development") {
  console.warn("[sentry] NEXT_PUBLIC_SENTRY_DSN не задан — ошибки браузера не будут отправляться в Sentry")
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
