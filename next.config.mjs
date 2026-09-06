import { withSentryConfig } from "@sentry/nextjs"

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.railway.app" },
      { protocol: "https", hostname: "**.vercel.app" },
    ],
  },
  /* Кросс-origin изоляция ТОЛЬКО на роуте гостевой студии — WebContainer'у
     нужен SharedArrayBuffer (crossOriginIsolated). Глобально включать нельзя:
     COEP сломал бы сторонние встраивания/картинки на остальных страницах.
     COEP=credentialless (а не require-corp) — чтобы кросс-origin CDN (Monaco
     с jsdelivr) грузился без CORP-заголовков, но изоляция для WebContainer
     всё равно включалась. Сессия A: свой Live Run-роут добавляйте отдельным
     объектом в этот же массив (тот же паттерн) — конфликта не будет. */
  async headers() {
    const coiHeaders = [
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
    ]
    return [
      // Сессия A · Live Run авторизованного проекта (компонент ProjectLiveRun).
      { source: "/projects/:id/live", headers: coiHeaders },
      /* Claude B · «Мастерская» проекта (ProjectWorkspaceView): код + живой
         запуск + чат в ОДНОМ экране. Тот же credentialless, что у /studio —
         именно он позволяет держать Monaco (CDN) и WebContainer вместе. */
      { source: "/projects/:id/workspace", headers: coiHeaders },
      /* Та же Мастерская, открытая из режима разработчика (/dev/workspace/:id).
         Роут другой, компонент тот же — без этих заголовков в студии молча
         не заработало бы превью: WebContainer'у нужен SharedArrayBuffer. */
      { source: "/dev/workspace/:id", headers: coiHeaders },
    ]
  },
}

/* withSentryConfig no-op'ается сам, если SENTRY_AUTH_TOKEN не задан (сорсмапы
   просто не аплоадятся) — сборка и без него не ломается. */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
})
