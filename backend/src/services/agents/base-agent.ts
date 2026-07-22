import { callAnyProvider, extractCodeBlock, type ManifestEntry } from "../app-generator"
import { extractJson } from "../ai-router"
import { captureError } from "../../lib/sentry"
import { pipelineEvents } from "../chain-manager"
import { AgentMetrics } from "./metrics"
import { AgentCache } from "./cache"
import type { GeneratedFile } from "./types"

/* ================================================================
   OSGARD · Agent Pipeline — базовый класс и общие AI-хелперы
   ----------------------------------------------------------------
   Переиспользует провайдер-цепочку (Claude → DeepSeek → Grok) и
   извлечение кода/JSON из app-generator.ts/ai-router.ts — тот же
   паттерн "манифест файлов -> содержимое каждого файла", что и в
   генераторе Next.js-приложений, только применённый к бэкенд-коду,
   тестам и обзорам (оптимизация/безопасность). Каждый агент этого
   модуля НИКОГДА не бросает исключение из execute() — при недоступном
   AI или ошибке возвращает детерминированный fallback-артефакт.
   ================================================================ */

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly name: string
  abstract execute(input: TInput): Promise<TOutput>

  /** Шлёт событие прогресса в тот же канал task:${taskId}, который уже слушает
   *  SSE-роут generate-project.routes.ts (см. pipelineEvents, chain-manager.ts).
   *  Без taskId (например, локальный запуск example.ts) — no-op. */
  emitProgress(taskId: string | undefined, progress: number, message: string): void {
    if (!taskId) return
    pipelineEvents.emit(`task:${taskId}`, { type: "agent_progress", agent: this.name, progress, message })
  }

  /**
   * Оборачивает execute() метриками (agent_executions, metrics.ts), прогрессом
   * (emitProgress выше) и кешем результата по хешу входа (cache.ts). execute()
   * сам по себе не меняется и по-прежнему никогда не бросает исключение —
   * try/catch здесь лишь защитный рубеж на случай непредвиденной ошибки в самом
   * execute() (например, при добавлении нового агента, который этот контракт
   * ещё не соблюдает).
   */
  async run(input: TInput, taskId?: string): Promise<TOutput> {
    const cacheStartedAt = Date.now()
    const cached = await AgentCache.get<TOutput>(this.name, input)
    AgentMetrics.trackCache(this.name, cached !== null, Date.now() - cacheStartedAt)

    if (cached !== null) {
      this.emitProgress(taskId, 100, `${this.name}: результат из кэша`)
      return cached
    }

    this.emitProgress(taskId, 0, `${this.name}: старт`)
    const startedAt = Date.now()

    try {
      const output = await this.execute(input)
      AgentMetrics.track(this.name, true, Date.now() - startedAt, taskId)
      this.emitProgress(taskId, 100, `${this.name}: готово`)
      await AgentCache.set(this.name, input, output)
      return output
    } catch (err) {
      AgentMetrics.track(this.name, false, Date.now() - startedAt, taskId)
      this.emitProgress(taskId, 100, `${this.name}: ошибка`)
      /* Промаха кеша перед этим уже достаточно, чтобы гарантировать: неудачный
         execute() не мог записать плохой результат (AgentCache.set вызывается
         только после успеха, см. выше). del здесь — подчистка на случай, если
         конкурентный run() с тем же входом успел закешировать результат между
         этим промахом и этой ошибкой (не должно давать сбоящему входу "залипнуть"
         в кеше от соседнего вызова). */
      await AgentCache.del(this.name, input)
      throw err
    }
  }
}

/** Запрашивает у модели JSON-манифест { files: [{path, purpose}] }, отфильтрованный по pathPattern. */
async function generateManifest(prompt: string, maxEntries: number, pathPattern: RegExp): Promise<ManifestEntry[] | null> {
  try {
    const text = await callAnyProvider(prompt, 2048)
    if (!text) return null

    const parsed = extractJson(text)
    const rawFiles = Array.isArray(parsed?.files) ? parsed.files : []

    const entries: ManifestEntry[] = rawFiles
      .filter((f: any) => f && typeof f.path === "string" && typeof f.purpose === "string")
      .map((f: any) => ({ path: f.path.replace(/^\/+/, ""), purpose: f.purpose }))
      .filter((f: ManifestEntry) => pathPattern.test(f.path))
      .slice(0, maxEntries)

    return entries.length > 0 ? entries : null
  } catch (err) {
    captureError("[agents] generateManifest failed:", err)
    return null
  }
}

/**
 * Второй шаг генерации: по уже известному манифесту генерирует содержимое каждого файла
 * параллельно. Используется как напрямую (манифест известен детерминированно — TesterAgent),
 * так и через generateFileSet (манифест сначала запрашивается у AI — BackendAgent).
 */
export async function generateFilesFromManifest(opts: {
  manifest: ManifestEntry[]
  filePrompt: (entry: ManifestEntry, manifest: ManifestEntry[]) => string
  fileMaxTokens?: number
  logLabel: string
}): Promise<GeneratedFile[] | null> {
  try {
    if (opts.manifest.length === 0) return null

    const generated = await Promise.all(
      opts.manifest.map(async (entry) => {
        const text = await callAnyProvider(opts.filePrompt(entry, opts.manifest), opts.fileMaxTokens ?? 6000)
        const content = text ? extractCodeBlock(text) : null
        return content ? { path: entry.path, content } : null
      }),
    )

    const files = generated.filter((f): f is GeneratedFile => f !== null)
    return files.length > 0 ? files : null
  } catch (err) {
    captureError(`[agents] ${opts.logLabel} generateFilesFromManifest failed:`, err)
    return null
  }
}

/**
 * Полный цикл генерации набора файлов: манифест (AI) -> содержимое каждого файла (AI).
 * Возвращает null при недоступности AI или пустом результате — вызывающий агент откатывается
 * на собственный fallback-артефакт.
 */
export async function generateFileSet(opts: {
  manifestPrompt: string
  maxEntries: number
  pathPattern: RegExp
  filePrompt: (entry: ManifestEntry, manifest: ManifestEntry[]) => string
  fileMaxTokens?: number
  logLabel: string
}): Promise<GeneratedFile[] | null> {
  const manifest = await generateManifest(opts.manifestPrompt, opts.maxEntries, opts.pathPattern)
  if (!manifest) return null

  return generateFilesFromManifest({
    manifest,
    filePrompt: opts.filePrompt,
    fileMaxTokens: opts.fileMaxTokens,
    logLabel: opts.logLabel,
  })
}

/** Единичный вызов AI с ожиданием переписанного файла в code-фенсе (без манифеста). */
export async function regenerateFile(prompt: string, maxTokens: number, logLabel: string): Promise<string | null> {
  try {
    const text = await callAnyProvider(prompt, maxTokens)
    if (!text) return null
    return extractCodeBlock(text)
  } catch (err) {
    captureError(`[agents] ${logLabel} regenerateFile failed:`, err)
    return null
  }
}

/** Единичный вызов AI с ожиданием структурированного JSON-обзора (Optimizer/Security findings). */
export async function generateReview<T>(prompt: string, maxTokens: number, logLabel: string): Promise<T | null> {
  try {
    const text = await callAnyProvider(prompt, maxTokens)
    if (!text) return null
    return (extractJson(text) as T) ?? null
  } catch (err) {
    captureError(`[agents] ${logLabel} generateReview failed:`, err)
    return null
  }
}

export function schemaSummary(schema: { name: string; description: string; entities: Array<{ name: string; fields: Array<{ name: string; type: string; required?: boolean; unique?: boolean }> }> }): string {
  return schema.entities
    .map((e) => `- ${e.name}: ${e.fields.map((f) => `${f.name}:${f.type}${f.required ? "!" : ""}${f.unique ? " unique" : ""}`).join(", ")}`)
    .join("\n")
}

export function fileListSummary(files: GeneratedFile[]): string {
  return files.map((f) => `- ${f.path}`).join("\n")
}
