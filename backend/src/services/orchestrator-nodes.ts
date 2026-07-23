import db from "../lib/db"
import { callClaudeApi, callDeepSeek, callGrok } from "./ai-router"
import { getConnector, getConnectorAction } from "./service-bridge/connector-registry"
import { runIntegrationAction, type IntegrationRow } from "./service-bridge/service-bridge-engine"
import { isServiceBridgeLimitExceeded, incrementServiceBridgeUsage } from "../lib/integrationsQuota"
import { isProviderLimitExceeded, incrementProviderUsage } from "../lib/orchestratorProviderQuota"
import type { PlanKey } from "../lib/stripe"

/* ================================================================
   OSGARD · Оркестратор — адаптеры узлов
   ----------------------------------------------------------------
   Единая точка вызова модели для узла цепочки («сегмента змеи»).
   Каждый адаптер получает текст входа + общий контекст цепочки и
   возвращает текст выхода + (опционально обогащённый) контекст —
   контракт { context, input } → { output, context } из ТЗ.
   Поверх уже существующего ai-router.ts (никаких новых провайдеров).

   service_call — узел вызывает действие подключённой Service Bridge
   интеграции пользователя вместо AI-модели; использует тот же
   универсальный HTTP-движок и дневную квоту, что и REST-эндпоинт
   POST /integrations/:id/execute (см. service-bridge.routes.ts).
   ================================================================ */

export type OrchestratorNodeType = "claude" | "deepseek" | "grok" | "prompt_template" | "service_call" | "webhook_trigger"

export interface OrchestratorNodeConfig {
  type: OrchestratorNodeType
  systemPrompt?: string
  /** Для prompt_template — шаблон с плейсхолдером {{input}}, обогащает вход перед следующим узлом. */
  template?: string
  temperature?: number
  maxTokens?: number
  /** Для service_call — id подключённой интеграции (integrations.id) и действие коннектора. */
  integrationId?: number
  actionId?: string
  /** Для service_call — параметры действия; значения могут содержать {{input}} и {{context.KEY}}. */
  params?: Record<string, string>
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

/** Подставляет {{input}} и {{context.KEY}} в шаблон параметра узла service_call. */
function fillNodePlaceholders(template: string, input: string, context: ChainContext): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    if (key === "input") return input
    if (key.startsWith("context.")) {
      const value = context[key.slice("context.".length)]
      return value === undefined ? "" : String(value)
    }
    return ""
  })
}

async function runServiceCallNode(config: OrchestratorNodeConfig, input: string, context: ChainContext, userId: number): Promise<NodeResult> {
  if (!config.integrationId || !config.actionId) throw new NodeExecutionError("service_call")

  const integration = db
    .prepare(`SELECT * FROM integrations WHERE id = ? AND user_id = ?`)
    .get(config.integrationId, userId) as IntegrationRow | undefined
  if (!integration) throw new NodeExecutionError("service_call")

  const connector = getConnector(integration.connector_id)
  const action = connector ? getConnectorAction(connector, config.actionId) : undefined
  if (!connector || !action) throw new NodeExecutionError("service_call")

  const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
  const plan: PlanKey = userRow?.plan ?? "free"
  if (await isServiceBridgeLimitExceeded(userId, plan)) throw new NodeExecutionError("service_call")

  const actionParams: Record<string, unknown> = {}
  for (const [key, template] of Object.entries(config.params ?? {})) {
    actionParams[key] = fillNodePlaceholders(template, input, context)
  }

  const result = await withTimeout(runIntegrationAction(integration, action.id, actionParams), NODE_TIMEOUT_MS, "service_call")
  await incrementServiceBridgeUsage(userId)

  if (!result.success) throw new NodeExecutionError("service_call")

  const output = typeof result.data === "string" ? result.data : JSON.stringify(result.data ?? {})
  return { output, context: { ...context, lastServiceCallResult: result.data } }
}

/**
 * Выполняет один узел цепочки: { context, input } → { output, context }.
 * Бросает NodeTimeoutError/NodeExecutionError — вызывающий код (orchestrator.service.ts)
 * должен остановить цепочку при любой ошибке узла.
 */
export async function runNode(config: OrchestratorNodeConfig, input: string, context: ChainContext, userId: number): Promise<NodeResult> {
  const maxTokens = config.maxTokens ?? DEFAULT_MAX_TOKENS

  if (config.type === "prompt_template") {
    return { output: renderTemplate(config.template, input), context }
  }

  if (config.type === "webhook_trigger") {
    // Точка входа: просто пропускает тело входящего webhook-запроса дальше по цепочке.
    return { output: input, context }
  }

  if (config.type === "service_call") {
    return runServiceCallNode(config, input, context, userId)
  }

  if (config.type !== "claude" && config.type !== "deepseek" && config.type !== "grok") {
    throw new NodeExecutionError(config.type)
  }

  const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
  const plan: PlanKey = userRow?.plan ?? "free"
  if (await isProviderLimitExceeded(userId, plan, config.type)) throw new NodeExecutionError(config.type)

  const call = (async (): Promise<string | null> => {
    if (config.type === "claude") {
      return callClaudeApi(input, maxTokens, config.systemPrompt, config.temperature)
    }
    if (config.type === "deepseek") {
      return callDeepSeek(input, (t) => t, "orchestrator-deepseek", maxTokens, config.systemPrompt, config.temperature)
    }
    return callGrok(input, (t) => t, "orchestrator-grok", maxTokens, config.systemPrompt, config.temperature)
  })()

  let text: string | null
  try {
    text = await withTimeout(call, NODE_TIMEOUT_MS, config.type)
  } catch (err) {
    if (err instanceof NodeTimeoutError) throw err
    throw new NodeExecutionError(config.type)
  }

  if (text === null) throw new NodeExecutionError(config.type)
  await incrementProviderUsage(userId, plan, config.type)
  return { output: text, context }
}
