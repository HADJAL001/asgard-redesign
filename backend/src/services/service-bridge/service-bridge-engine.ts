import axios from "axios"
import db from "../../lib/db"
import { encrypt, decrypt } from "../../utils/encryption"
import { isPublicHttpUrl } from "../../lib/url-safety"
import { getConnector, getConnectorAction, type ConnectorDefinition, type ConnectorAction } from "./connector-registry"

/* ================================================================
   OSGARD · Service Bridge — движок выполнения действий коннекторов
   ----------------------------------------------------------------
   Один универсальный HTTP-исполнитель для всех коннекторов реестра:
   собирает запрос (baseUrl + путь + auth + параметры), делает вызов
   через axios с таймаутом, логирует результат в integration_logs.

   Секретные поля конфига хранятся в integrations.config зашифрованными
   (utils/encryption.ts) — расшифровываются только здесь, непосредственно
   перед вызовом, и никогда не возвращаются клиенту в явном виде
   (см. redactConfig).
   ================================================================ */

const ACTION_TIMEOUT_MS = 15_000
const MAX_SUMMARY_LENGTH = 2000

export interface IntegrationRow {
  id: number
  user_id: number
  connector_id: string
  name: string
  config: string
  status: string
  last_test_at: number | null
  last_test_status: string | null
  last_test_error: string | null
  created_at: number
  updated_at: number
}

export interface ActionResult {
  success: boolean
  status?: number
  data?: unknown
  error?: string
  durationMs: number
}

export class ServiceBridgeError extends Error {}

/** Валидирует, что все обязательные поля коннектора присутствуют, и шифрует секретные. */
export function encryptConfig(connector: ConnectorDefinition, rawConfig: Record<string, string>): string {
  const out: Record<string, string> = {}
  for (const field of connector.fields) {
    const val = rawConfig[field.key]
    if (field.required && (val === undefined || val === null || String(val).trim() === "")) {
      throw new ServiceBridgeError(`missing_field:${field.key}`)
    }
    if (val === undefined || val === null || val === "") continue
    out[field.key] = field.secret ? encrypt(String(val)) : String(val)
  }
  return JSON.stringify(out)
}

function decryptConfig(connector: ConnectorDefinition, configJson: string): Record<string, string> {
  const raw = JSON.parse(configJson) as Record<string, string>
  const out: Record<string, string> = {}
  for (const field of connector.fields) {
    const val = raw[field.key]
    if (val === undefined) continue
    out[field.key] = field.secret ? decrypt(val) : val
  }
  return out
}

function maskSecret(value: string): string {
  if (!value) return ""
  if (value.length <= 4) return "••••"
  return `••••${value.slice(-4)}`
}

/** Конфиг для отдачи клиенту — секретные поля замаскированы, расшифровка не всегда возможна (не критично для маски). */
export function redactConfig(connector: ConnectorDefinition, configJson: string): Record<string, string> {
  const raw = JSON.parse(configJson) as Record<string, string>
  const out: Record<string, string> = {}
  for (const field of connector.fields) {
    const val = raw[field.key]
    if (val === undefined) continue
    if (!field.secret) {
      out[field.key] = val
      continue
    }
    try {
      out[field.key] = maskSecret(decrypt(val))
    } catch {
      out[field.key] = "••••"
    }
  }
  return out
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => encodeURIComponent(vars[key] ?? ""))
}

function truncate(value: unknown): unknown {
  const str = typeof value === "string" ? value : JSON.stringify(value)
  if (!str || str.length <= MAX_SUMMARY_LENGTH) return value
  return typeof value === "string" ? str.slice(0, MAX_SUMMARY_LENGTH) + "…" : JSON.parse(JSON.stringify(value))
}

/**
 * Достаёт человекочитаемое описание ошибки из тела ответа внешнего API
 * (у каждого сервиса свой формат: Telegram — description, Stripe — error.message,
 * SendGrid — errors[0].message, GitHub/Notion — message, Slack — error).
 * При отсутствии распознаваемого поля возвращается только код статуса.
 */
function extractErrorMessage(status: number, data: unknown): string {
  if (data && typeof data === "object") {
    const d = data as Record<string, any>
    const candidate =
      d.description ??
      d.error_description ??
      (typeof d.error === "string" ? d.error : d.error?.message) ??
      d.message ??
      (Array.isArray(d.errors) ? d.errors[0]?.message : undefined)
    if (typeof candidate === "string" && candidate.trim()) {
      return `http_${status}: ${candidate.trim()}`
    }
  }
  return `http_${status}`
}

interface BuiltRequest {
  url: string
  method: string
  headers: Record<string, string>
  params: Record<string, unknown>
  data: Record<string, unknown> | undefined
}

function buildRequest(
  connector: ConnectorDefinition,
  action: ConnectorAction,
  config: Record<string, string>,
  actionParams: Record<string, unknown>,
): BuiltRequest {
  const baseUrl = connector.customBaseUrl ? config.baseUrl || "" : fillTemplate(connector.baseUrl, config)
  if (connector.customBaseUrl && !isPublicHttpUrl(baseUrl)) {
    throw new ServiceBridgeError("invalid_base_url")
  }

  const pathParams: Record<string, string> = {}
  const queryParams: Record<string, unknown> = {}
  const bodyParams: Record<string, unknown> = {}

  for (const p of action.params ?? []) {
    const val = actionParams[p.key]
    if (val === undefined || val === null || val === "") {
      if (p.required) throw new ServiceBridgeError(`missing_param:${p.key}`)
      continue
    }
    if (p.in === "path") pathParams[p.key] = String(val)
    else if (p.in === "query") queryParams[p.key] = val
    else bodyParams[p.key] = val
  }

  const path = fillTemplate(action.path, pathParams)
  const suffix = path ? (path.startsWith("/") ? path : `/${path}`) : ""
  const url = `${baseUrl.replace(/\/$/, "")}${suffix}`

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (connector.authType === "bearer") {
    headers.Authorization = `Bearer ${config.apiKey ?? ""}`
  } else if (connector.authType === "header" && connector.authHeaderName) {
    if (config.authHeaderValue) headers[connector.authHeaderName] = config.authHeaderValue
  } else if (connector.authType === "query" && connector.authQueryParam) {
    queryParams[connector.authQueryParam] = config.apiKey ?? ""
  }

  return {
    url,
    method: action.method,
    headers,
    params: queryParams,
    data: Object.keys(bodyParams).length ? bodyParams : undefined,
  }
}

function logIntegrationCall(
  integration: IntegrationRow,
  actionId: string,
  actionParams: Record<string, unknown>,
  result: ActionResult,
): void {
  db.prepare(
    `INSERT INTO integration_logs
       (integration_id, user_id, action_id, status, duration_ms, request_summary, response_summary, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    integration.id,
    integration.user_id,
    actionId,
    result.success ? "success" : "error",
    result.durationMs,
    JSON.stringify(truncate(actionParams)),
    result.data !== undefined ? JSON.stringify(truncate(result.data)) : null,
    result.error ?? null,
    Date.now(),
  )
}

/**
 * Выполняет действие коннектора для интеграции: собирает запрос, вызывает
 * внешний API, логирует результат. При isTest=true дополнительно обновляет
 * last_test_at/last_test_status на самой интеграции.
 */
export async function runIntegrationAction(
  integration: IntegrationRow,
  actionId: string,
  actionParams: Record<string, unknown>,
  opts: { isTest?: boolean } = {},
): Promise<ActionResult> {
  const connector = getConnector(integration.connector_id)
  if (!connector) return { success: false, error: "unknown_connector", durationMs: 0 }

  const action = getConnectorAction(connector, actionId)
  if (!action) return { success: false, error: "unknown_action", durationMs: 0 }

  const start = Date.now()
  let result: ActionResult

  try {
    const config = decryptConfig(connector, integration.config)
    const req = buildRequest(connector, action, config, actionParams)

    const response = await axios.request({
      url: req.url,
      method: req.method as any,
      headers: req.headers,
      params: req.params,
      data: req.data,
      timeout: ACTION_TIMEOUT_MS,
      validateStatus: () => true,
    })

    const durationMs = Date.now() - start
    const success = response.status >= 200 && response.status < 300
    result = {
      success,
      status: response.status,
      data: truncate(response.data),
      error: success ? undefined : extractErrorMessage(response.status, response.data),
      durationMs,
    }
  } catch (err: any) {
    result = { success: false, error: err instanceof ServiceBridgeError ? err.message : (err?.message ?? "request_failed"), durationMs: Date.now() - start }
  }

  logIntegrationCall(integration, actionId, actionParams, result)

  if (opts.isTest) {
    db.prepare(
      `UPDATE integrations SET last_test_at = ?, last_test_status = ?, last_test_error = ?, updated_at = ? WHERE id = ?`,
    ).run(Date.now(), result.success ? "success" : "error", result.success ? null : (result.error ?? "unknown_error"), Date.now(), integration.id)
  }

  return result
}

export function getIntegrationTestAction(connector: ConnectorDefinition): ConnectorAction | undefined {
  return connector.actions.find((a) => a.isTestAction) ?? connector.actions[0]
}
