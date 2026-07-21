import Redis from "ioredis"

/* ================================================================
   OSGARD · Redis client (опционально)
   ----------------------------------------------------------------
   Если REDIS_URL не задан — клиент не создаётся, cache.service.ts
   работает целиком на in-memory Map. Если задан, но соединение
   рвётся/падает — ошибки только логируются, кеш откатывается на
   in-memory для конкретной операции (см. cache.service.ts), процесс
   не падает: кеш не критичная зависимость.

   Клиент создаётся ЛЕНИВО (при первом ensureRedisConnected), а не при
   импорте модуля — иначе process.env.REDIS_URL может быть ещё не
   прочитан из .env (dotenv.config() из-за хостинга ES-импортов
   выполняется позже импортов, а не в порядке написания в коде).
   ================================================================ */

export let redisClient: Redis | null = null

let connectPromise: Promise<void> | null = null

/** Гарантирует, что клиент создан и подключён перед первой командой. */
export async function ensureRedisConnected(): Promise<boolean> {
  const REDIS_URL = process.env.REDIS_URL || ""
  if (!REDIS_URL) return false

  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
      lazyConnect: true,
    })
    redisClient.on("error", (err) => {
      console.warn("[redis] connection error:", err.message)
    })
    redisClient.on("connect", () => {
      console.log("[redis] connected")
    })
  }

  if ((redisClient.status as string) === "ready") return true
  if (!connectPromise) {
    connectPromise = redisClient.connect().catch((err) => {
      console.warn("[redis] initial connect failed:", err.message)
    })
  }
  await connectPromise
  return (redisClient.status as string) === "ready"
}
