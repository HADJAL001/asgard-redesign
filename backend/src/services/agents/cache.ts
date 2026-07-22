import { createHash } from "node:crypto"
import { cacheService } from "../cache.service"

/* ================================================================
   OSGARD · AgentCache
   ----------------------------------------------------------------
   Кеширует результат agent.run() по хешу входа (см. base-agent.ts).
   Оборачивает уже существующий cacheService (Redis, если доступен,
   иначе in-memory Map процесса, см. cache.service.ts) — отдельного
   Redis-клиента здесь не заводим.

   TTL заметно больше дефолтных 60с cacheService: вход агента
   (schema/frontend/backend/tests) — тяжёлый AI-артефакт, а не
   быстро устаревающие данные вроде баланса/курсов.
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
    try {
      const cached = await cacheService.get(cacheKey(agentName, input))
      return (cached as T | null) ?? null
    } catch (err: any) {
      console.warn(`⚠️ AgentCache.get failed for ${agentName}, continuing without cache:`, err?.message ?? err)
      return null
    }
  },
  async set(agentName: string, input: unknown, value: unknown): Promise<void> {
    try {
      await cacheService.set(cacheKey(agentName, input), value, TTL_SECONDS)
    } catch (err: any) {
      console.warn(`⚠️ AgentCache.set failed for ${agentName}, continuing without cache:`, err?.message ?? err)
    }
  },
  /** Инвалидация записи (см. BaseAgent.run в base-agent.ts — вызывается при ошибке execute()). */
  async del(agentName: string, input: unknown): Promise<void> {
    try {
      await cacheService.del(cacheKey(agentName, input))
    } catch (err: any) {
      console.warn(`⚠️ AgentCache.del failed for ${agentName}:`, err?.message ?? err)
    }
  },
}
