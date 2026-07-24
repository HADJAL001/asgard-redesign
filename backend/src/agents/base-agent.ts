import { createHash } from "node:crypto"
import type { ZodType } from "zod"
import { callClaudeApi, callDeepSeek, extractJson } from "../services/ai-router"
import { captureError } from "../lib/sentry"
import { cacheService } from "../services/cache.service"
import { CacheMetrics } from "./metrics"
import type { PipelineArtifact, PipelineArtifactSource, PipelineArtifactType } from "./types"

/* ================================================================
   OSGARD · Агенты сборки проекта — базовый класс
   ----------------------------------------------------------------
   Единая механика вызова модели для всех 4 агентов пайплайна:
   промт → Claude → (при неудаче) DeepSeek → (при неудаче) локальный
   детерминированный fallback. Ответ всегда проверяется Zod-схемой —
   если провайдер вернул невалидный JSON, он считается неудачей и
   пайплайн переходит к следующему провайдеру. execute() никогда не
   бросает исключение и не возвращает null (тот же принцип, что и
   generateAiArtifactContent в services/ai-artifact-generator.ts),
   т.к. агенты — синхронный шаг пайплайна, который не должен падать
   из-за отсутствия API-ключей в окружении.

   Кэширование результата по хешу входа — через общий cacheService
   (Redis, если задан REDIS_URL, иначе in-memory Map в этом процессе,
   см. services/cache.service.ts). Отдельного Redis-клиента/Prisma-слоя
   под агентов не заводим — в проекте их и так нет (SQLite через
   better-sqlite3, см. lib/db.ts).
   ================================================================ */

const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_CACHE_TTL_SECONDS = 3600

export abstract class BaseAgent<TInput, TOutput> {
  /** Человекочитаемая роль агента, попадает в PipelineArtifact.agent (например "Бизнес-аналитик"). */
  abstract readonly role: string

  /** Тип артефакта в общем конверте PipelineArtifact. */
  abstract readonly artifactType: PipelineArtifactType

  /** Zod-схема ожидаемого JSON-ответа модели. */
  abstract readonly schema: ZodType<TOutput>

  /** Лимит токенов ответа — переопределяется агентами с более объёмным выходом (например Frontend). */
  protected readonly maxTokens: number = DEFAULT_MAX_TOKENS

  /** TTL кэша результата (сек) — переопределяется агентами, где повторный вход даёт другой смысл. */
  protected readonly cacheTtlSeconds: number = DEFAULT_CACHE_TTL_SECONDS

  /** Строит промт для модели, требующий строго валидный JSON-ответ по форме schema. */
  protected abstract buildPrompt(input: TInput): string

  /** Детерминированный локальный fallback — используется, если ни один AI-провайдер не ответил валидным JSON. */
  protected abstract buildFallback(input: TInput): TOutput

  private wrap(data: TOutput, source: PipelineArtifactSource): PipelineArtifact<TOutput> {
    return {
      type: this.artifactType,
      agent: this.role,
      data,
      source,
      createdAt: Date.now(),
    }
  }

  private parseAndValidate(text: string | null): TOutput | null {
    if (!text) return null
    const parsed = extractJson(text)
    if (!parsed) return null
    const result = this.schema.safeParse(parsed)
    return result.success ? result.data : null
  }

  private cacheKey(input: TInput): string {
    const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex")
    return `agent:${this.artifactType}:${hash}`
  }

  /** Оборачивает произвольное вычисление результата агента кэшем по хешу input.
   *  Используется как из execute() ниже, так и агентами с нестандартным потоком
   *  выполнения (например FrontendAgent, который переопределяет execute()). */
  protected async withCache(
    input: TInput,
    compute: () => Promise<PipelineArtifact<TOutput>>,
  ): Promise<PipelineArtifact<TOutput>> {
    const key = this.cacheKey(input)
    const cached = await cacheService.get(key)
    if (cached) {
      CacheMetrics.recordHit(this.role)
      console.log(`[agents] ${this.role} cache HIT`)
      return { ...(cached as PipelineArtifact<TOutput>), source: "cache" }
    }

    const startedAt = Date.now()
    const result = await compute()
    CacheMetrics.recordMiss(this.role, Date.now() - startedAt)
    await cacheService.set(key, result, this.cacheTtlSeconds)
    CacheMetrics.trackKey(key, this.cacheTtlSeconds)
    return result
  }

  /** Принудительно удаляет закэшированный результат для конкретного input — например,
   *  если вход считается устаревшим раньше истечения TTL (не вызывается автоматически
   *  внутри пайплайна, доступен агентам/наследникам как явная операция). */
  protected async invalidateCache(input: TInput): Promise<void> {
    const key = this.cacheKey(input)
    await cacheService.del(key)
    CacheMetrics.untrackKey(key)
  }

  private async generate(input: TInput): Promise<PipelineArtifact<TOutput>> {
    const prompt = this.buildPrompt(input)

    try {
      const claudeText = await callClaudeApi(prompt, this.maxTokens)
      const claudeResult = this.parseAndValidate(claudeText)
      if (claudeResult) return this.wrap(claudeResult, "claude")
    } catch (err) {
      captureError(`[agents] ${this.role} Claude call failed:`, err)
    }

    try {
      const deepseekResult = await callDeepSeek<TOutput>(
        prompt,
        (text) => this.parseAndValidate(text),
        `agent-${this.artifactType}`,
        this.maxTokens,
      )
      if (deepseekResult) return this.wrap(deepseekResult, "deepseek")
    } catch (err) {
      captureError(`[agents] ${this.role} DeepSeek call failed:`, err)
    }

    return this.wrap(this.buildFallback(input), "fallback")
  }

  async execute(input: TInput): Promise<PipelineArtifact<TOutput>> {
    return this.withCache(input, () => this.generate(input))
  }
}
