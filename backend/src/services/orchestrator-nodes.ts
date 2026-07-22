import { callClaudeApi, callDeepSeek, callGrok } from "./ai-router"

/* ================================================================
   OSGARD · Оркестратор — адаптеры узлов
   ----------------------------------------------------------------
   Единая точка вызова модели для узла цепочки («сегмента змеи»).
   Каждый адаптер получает текст входа + общий контекст цепочки и
   возвращает текст выхода + (опционально обогащённый) контекст —
   контракт { context, input } → { output, context } из ТЗ.
   Поверх уже существующего ai-router.ts (никаких новых провайдеров).
   ================================================================ */

export type OrchestratorNodeType = "claude" | "deepseek" | "grok" | "prompt_template"

export interface OrchestratorNodeConfig {
  type: OrchestratorNodeType
  systemPrompt?: string
  /** Для prompt_template — шаблон с плейсхолдером {{input}}, обогащает вход перед следующим узлом. */
  template?: string
  temperature?: number
  maxTokens?: number
}

export type ChainContext = Record<string, any>

export interface NodeResult {
  output: string
  context: ChainContext
}

const NODE_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TOKENS = 1024

class NodeTimeoutError extends Error {
  constructor(nodeType: string) {
    super(`node_timeout:${nodeType}`)
    this.name = "NodeTimeoutError"
  }
}

class NodeExecutionError extends Error {
  constructor(nodeType: string) {
    super(`node_failed:${nodeType}`)
    this.name = "NodeExecutionError"
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, nodeType: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new NodeTimeoutError(nodeType)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/** Подстановка предыдущего вывода в шаблон промпта (узел без вызова AI). */
function renderTemplate(template: string | undefined, input: string): string {
  if (!template) return input
  return template.replace(/\{\{\s*input\s*\}\}/gi, input)
}

/**
 * Выполняет один узел цепочки: { context, input } → { output, context }.
 * Бросает NodeTimeoutError/NodeExecutionError — вызывающий код (orchestrator.service.ts)
 * должен остановить цепочку при любой ошибке узла.
 */
export async function runNode(config: OrchestratorNodeConfig, input: string, context: ChainContext): Promise<NodeResult> {
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS

  if (config.type === "prompt_template") {
    return { output: renderTemplate(config.template, input), context }
  }

  const call = (async (): Promise<string | null> => {
    if (config.type === "claude") {
      return callClaudeApi(input, maxTokens, config.systemPrompt, config.temperature)
    }
    if (config.type === "deepseek") {
      return callDeepSeek(input, (t) => t, "orchestrator-deepseek", maxTokens, config.systemPrompt, config.temperature)
    }
    if (config.type === "grok") {
      return callGrok(input, (t) => t, "orchestrator-grok", maxTokens, config.systemPrompt, config.temperature)
    }
    throw new NodeExecutionError(config.type)
  })()

  let text: string | null
  try {
    text = await withTimeout(call, NODE_TIMEOUT_MS, config.type)
  } catch (err) {
    if (err instanceof NodeTimeoutError) throw err
    throw new NodeExecutionError(config.type)
  }

  if (text === null) throw new NodeExecutionError(config.type)
  return { output: text, context }
}
