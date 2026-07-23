/* ================================================================
   OSGARD · Service Bridge (Интеграции) — типы клиента
   ----------------------------------------------------------------
   Зеркалит публичные шейпы backend/src/services/service-bridge/*
   и backend/src/routes/service-bridge.routes.ts. Секретные поля
   коннектора никогда не приходят на клиент в открытом виде —
   только замаскированные (см. redactConfig на бэкенде).
   ================================================================ */

export type ConnectorFieldType = "text" | "password"

export interface ConnectorField {
  key: string
  label: string
  type: ConnectorFieldType
  secret: boolean
  required: boolean
  placeholder?: string
}

export type ConnectorActionParamIn = "query" | "body" | "path"

export interface ConnectorActionParam {
  key: string
  label: string
  in: ConnectorActionParamIn
  required?: boolean
}

export type ConnectorMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface ConnectorAction {
  id: string
  label: string
  method: ConnectorMethod
  description?: string
  params: ConnectorActionParam[]
  isTestAction: boolean
}

export interface ConnectorPublic {
  id: string
  name: string
  category: string
  description: string
  icon: string
  fields: ConnectorField[]
  actions: ConnectorAction[]
}

export type IntegrationStatus = "active" | "disabled"

export interface Integration {
  id: number
  connectorId: string
  connectorName: string
  name: string
  status: IntegrationStatus
  lastTestAt: number | null
  lastTestStatus: string | null
  lastTestError: string | null
  /** Значения секретных полей замаскированы (••••1234), не реальные секреты. */
  config: Record<string, string>
  createdAt: number
  updatedAt: number
}

export interface CreateIntegrationInput {
  connectorId: string
  name: string
  config: Record<string, string>
}

export interface UpdateIntegrationInput {
  name?: string
  config?: Record<string, string>
  status?: IntegrationStatus
}

export interface ActionResult {
  success: boolean
  status?: number
  data?: unknown
  error?: string
  durationMs: number
}

export interface IntegrationLog {
  id: number
  integration_id: number
  user_id: number
  action_id: string
  status: "success" | "error"
  duration_ms: number
  request_summary: string | null
  response_summary: string | null
  error_message: string | null
  created_at: number
}

export interface IntegrationsQuota {
  remaining: number | null
  total: number | null
  isPaid: boolean
}
