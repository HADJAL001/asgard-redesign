import { AsyncLocalStorage } from "node:async_hooks"

/* ================================================================
   OSGARD · Телеметрия генерации — честный счётчик расхода
   ----------------------------------------------------------------
   Зачем: на рынке AI-сборщиков приложений (Lovable, Bolt, v0, Replit)
   самая частая претензия пользователей — расход кредитов непредсказуем
   и становится известен ЗАДНИМ ЧИСЛОМ. Человек узнаёт цену попытки
   только когда квота уже потрачена.

   Здесь считается фактический расход КАЖДОЙ генерации: сколько вызовов
   к моделям, сколько токенов туда и обратно, сколько это заняло времени.
   Счётчик пополняется из единственных двух точек выхода в сеть
   (`services/ai-router.ts`), поэтому ни один вызов не может пройти мимо.

   Почему AsyncLocalStorage, а не глобальная переменная: генерации идут
   параллельно (несколько пользователей + несколько файлов приложения
   одновременно через Promise.all). Глобальный счётчик смешал бы чужие
   токены в один котёл. ALS даёт каждой генерации собственный контекст,
   который автоматически наследуется всеми вложенными await-ветками.

   Контракт безопасности: телеметрия НИКОГДА не влияет на результат
   генерации. Нет активного контекста (вызов вне генерации, тест, скрипт)
   — запись молча игнорируется, вызывающий код об этом не знает.
   ================================================================ */

/** Один зафиксированный вызов модели. */
export type AiCallRecord = {
  provider: string
  model: string
  /** Токены запроса (промпт). 0, если провайдер не вернул usage. */
  inputTokens: number
  /** Токены ответа. 0, если провайдер не вернул usage. */
  outputTokens: number
  /** Длительность сетевого вызова в миллисекундах. */
  ms: number
  /** true, если провайдер не отдал usage и числа неизвестны (не «ноль потрачено»). */
  estimated: boolean
  ok: boolean
}

export type TelemetrySnapshot = {
  calls: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  /** Сумма времени сетевых вызовов (без пауз между ними). */
  aiMs: number
  /** Полное время генерации от старта контекста. */
  elapsedMs: number
  /** Сколько вызовов не отдали usage — честная оговорка к цифре. */
  unmeasured: number
  failed: number
  /** Разбивка по провайдерам — видно, кто сколько съел. */
  byProvider: Record<string, { calls: number; tokens: number }>
  tokenLimit?: number | null
  tokensRemaining?: number | null
}

type TelemetryContext = {
  startedAt: number
  records: AiCallRecord[]
  /** Необязательный слушатель: вызывается после каждого записанного вызова,
   *  чтобы живой счётчик в интерфейсе тикал по мере расхода, а не в конце. */
  onUpdate?: (snapshot: TelemetrySnapshot) => void
  tokenLimit: number | null
  reservedTokens: number
}

export class GenerationTokenBudgetExceededError extends Error {
  readonly code = "GENERATION_TOKEN_BUDGET_EXCEEDED"

  constructor(readonly limit: number, readonly spent: number, readonly requested: number) {
    super(`Generation token budget exceeded: ${spent} spent/reserved, ${requested} requested, ${limit} limit`)
    this.name = "GenerationTokenBudgetExceededError"
  }
}

const storage = new AsyncLocalStorage<TelemetryContext>()

/** Грубая оценка токенов по длине текста — только для провайдеров без usage.
 *  Намеренно консервативная (≈4 символа на токен для латиницы, кириллица дороже),
 *  и всегда помечается флагом estimated: показывать оценку как точное число нечестно. */
export function estimateTokens(text: string): number {
  if (!text) return 0
  const cyrillic = (text.match(/[Ѐ-ӿ]/g) || []).length
  const rest = text.length - cyrillic
  return Math.ceil(cyrillic / 2 + rest / 4)
}

function emptySnapshot(startedAt: number, tokenLimit: number | null = null): TelemetrySnapshot {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    aiMs: 0,
    elapsedMs: Date.now() - startedAt,
    unmeasured: 0,
    failed: 0,
    byProvider: {},
    tokenLimit,
    tokensRemaining: tokenLimit,
  }
}

function summarize(ctx: TelemetryContext): TelemetrySnapshot {
  const snapshot = emptySnapshot(ctx.startedAt, ctx.tokenLimit)
  for (const r of ctx.records) {
    snapshot.calls += 1
    snapshot.inputTokens += r.inputTokens
    snapshot.outputTokens += r.outputTokens
    snapshot.aiMs += r.ms
    if (r.estimated) snapshot.unmeasured += 1
    if (!r.ok) snapshot.failed += 1
    const bucket = snapshot.byProvider[r.provider] || { calls: 0, tokens: 0 }
    bucket.calls += 1
    bucket.tokens += r.inputTokens + r.outputTokens
    snapshot.byProvider[r.provider] = bucket
  }
  snapshot.totalTokens = snapshot.inputTokens + snapshot.outputTokens
  snapshot.tokensRemaining = ctx.tokenLimit === null
    ? null
    : Math.max(0, ctx.tokenLimit - snapshot.totalTokens - ctx.reservedTokens)
  return snapshot
}

/** Reserve worst-case capacity synchronously before parallel provider calls start. */
export function reserveAiCallTokens(inputTokens: number, maxOutputTokens: number): () => void {
  const ctx = storage.getStore()
  if (!ctx || ctx.tokenLimit === null) return () => {}
  const requested = Math.max(0, Math.ceil(inputTokens)) + Math.max(0, Math.ceil(maxOutputTokens))
  const spent = summarize(ctx).totalTokens + ctx.reservedTokens
  if (spent + requested > ctx.tokenLimit) {
    throw new GenerationTokenBudgetExceededError(ctx.tokenLimit, spent, requested)
  }
  ctx.reservedTokens += requested
  let released = false
  return () => {
    if (released) return
    released = true
    ctx.reservedTokens = Math.max(0, ctx.reservedTokens - requested)
  }
}

/**
 * Запускает функцию в собственном контексте телеметрии. Все вызовы моделей
 * внутри (на любой глубине await) попадут в этот счётчик и никуда больше.
 *
 * Возвращает результат функции вместе с итоговым снимком — снимок доступен
 * даже если функция бросила исключение (тогда он приходит через onUpdate,
 * а исключение пробрасывается наружу без изменений).
 */
export async function withGenerationTelemetry<T>(
  fn: () => Promise<T>,
  onUpdate?: (snapshot: TelemetrySnapshot) => void,
  onFinish?: (snapshot: TelemetrySnapshot) => void,
  options?: { tokenLimit?: number | null },
): Promise<{ result: T; telemetry: TelemetrySnapshot }> {
  const configuredLimit = options?.tokenLimit
  const tokenLimit = typeof configuredLimit === "number" && Number.isFinite(configuredLimit) && configuredLimit > 0
    ? Math.floor(configuredLimit)
    : null
  const ctx: TelemetryContext = { startedAt: Date.now(), records: [], onUpdate, tokenLimit, reservedTokens: 0 }
  try {
    const result = await storage.run(ctx, fn)
    return { result, telemetry: summarize(ctx) }
  } finally {
    if (onFinish) {
      try {
        onFinish(summarize(ctx))
      } catch {
        // Usage persistence is observability. It must never replace the real job result.
      }
    }
  }
}

/** Записывает факт вызова модели в активный контекст. Вне контекста — no-op. */
export function recordAiCall(record: AiCallRecord): void {
  const ctx = storage.getStore()
  if (!ctx) return
  ctx.records.push(record)
  if (ctx.onUpdate) {
    try {
      ctx.onUpdate(summarize(ctx))
    } catch {
      // Слушатель живого счётчика не имеет права уронить генерацию.
    }
  }
}

/** Текущий снимок активного контекста (null вне генерации). */
export function currentTelemetry(): TelemetrySnapshot | null {
  const ctx = storage.getStore()
  return ctx ? summarize(ctx) : null
}

/** true, если сейчас есть активный контекст сбора. */
export function isTelemetryActive(): boolean {
  return storage.getStore() !== undefined
}
