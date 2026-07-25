import { createHash } from "node:crypto"
import { cacheService } from "../cache.service"
import { durableCache } from "./durable-cache"

/* ================================================================
   OSGARD · AgentCache
   ----------------------------------------------------------------
   Кеширует результат agent.run() по хешу входа (см. base-agent.ts).
   Двухуровневый кеш:
   - L1 = cacheService (Redis, если доступен, иначе in-memory Map).
     Быстрый, но in-memory Map теряется при рестарте процесса.
   - L2 = durableCache (SQLite). Переживает рестарт — именно он не даёт
     сложной генерации «начинать с нуля» после перезапуска бэкенда,
     когда Redis не сконфигурирован.

   get: сначала L1, при промахе — L2 (и прогреваем L1 обратно).
   set: пишем в оба. TTL заметно больше дефолтных 60с cacheService:
   вход агента (schema/frontend/backend/tests) — тяжёлый AI-артефакт,
   а не быстро устаревающие данные вроде баланса/курсов.
   ================================================================ */

const TTL_SECONDS = 3600

function generateHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

function cacheKey(agentName: string, input: unknown): string {
  return `agent:${agentName}:${generateHash(input)}`
}

export const AgentCache = {
  generateHash,
  /** cacheService сам никогда не бросает исключение (см. cache.service.ts —
   *  ошибки Redis там уже перехвачены с фолбэком на in-memory Map), но
   *  try/catch здесь — дополнительный защитный рубеж: агент обязан продолжить
   *  работу (промах кеша) при ЛЮБОЙ ошибке этого слоя, а не только ожидаемых. */
  async get<T>(agentName: string, input: unknown): Promise<T | null> {
    const key = cacheKey(agentName, input)
    try {
      const l1 = await cacheService.get(key)
      if (l1 !== null && l1 !== undefined) return l1 as T
      // Промах L1 — пробуем durable L2 (переживает рестарт) и прогреваем L1.
      const l2 = durableCache.get<T>(key)
      if (l2 !== null) {
        await cacheService.set(key, l2, TTL_SECONDS).catch(() => {})
        return l2
      }
      return null
    } catch (err: any) {
      console.warn(`⚠️ AgentCache.get failed for ${agentName}, continuing without cache:`, err?.message ?? err)
      return null
    }
  },
  async set(agentName: string, input: unknown, value: unknown): Promise<void> {
    const key = cacheKey(agentName, input)
    try {
      await cacheService.set(key, value, TTL_SECONDS)
    } catch (err: any) {
      console.warn(`⚠️ AgentCache.set failed for ${agentName}, continuing without cache:`, err?.message ?? err)
    }
    // durableCache — отдельный try, чтобы падение SQLite-слоя не убивало запись в L1 и наоборот.
    durableCache.set(key, value, TTL_SECONDS)
  },
  /** Инвалидация записи (см. BaseAgent.run в base-agent.ts — вызывается при ошибке execute()). */
  async del(agentName: string, input: unknown): Promise<void> {
    const key = cacheKey(agentName, input)
    try {
      await cacheService.del(key)
    } catch (err: any) {
      console.warn(`⚠️ AgentCache.del failed for ${agentName}:`, err?.message ?? err)
    }
    durableCache.del(key)
  },
}
