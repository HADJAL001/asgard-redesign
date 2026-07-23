import type { Edge, Node } from "@xyflow/react"

/* ================================================================
   OSGARD · Оркестратор — типы клиента
   ----------------------------------------------------------------
   Бэкенд выполняет цепочку СТРОГО линейно (топологический порядок
   узлов, выход N -> вход N+1) и не использует edges для маршрутизации
   данных — edges нужны только для валидации графа (циклы/висячие
   связи). Поэтому у узла нет отдельных "input"/"output" типов: любой
   узел может быть первым или последним в цепочке.

   Бэкенд не отсекает лишние поля у nodes/edges (JSON.stringify как
   есть), поэтому React Flow Node<OrchestratorNodeData> используется
   напрямую как wire-формат — отдельного слоя UI<->wire маппинга нет.
   ================================================================ */

export type OrchestratorNodeType = "claude" | "deepseek" | "grok" | "prompt_template" | "service_call"

/** Статус отдельного узла в рамках выполнения (node_statuses[i].status). */
export type OrchestratorNodeRunStatus = "pending" | "running" | "done" | "error"

/** Статус выполнения цепочки целиком (orchestrator_executions.status). Отдельный словарь от статуса узла. */
export type OrchestratorExecutionStatus = "pending" | "running" | "success" | "error"

export interface OrchestratorNodeData extends Record<string, unknown> {
  label: string
  type: OrchestratorNodeType
  systemPrompt?: string
  /** Только для prompt_template — шаблон с плейсхолдером {{input}}. */
  template?: string
  temperature?: number
  maxTokens?: number
  /** Для service_call — id подключённой интеграции (integrations.id) и действие коннектора. */
  integrationId?: number
  actionId?: string
  /** Для service_call — параметры действия; значения могут содержать {{input}} и {{context.KEY}}. */
  params?: Record<string, string>
}

export type OrchestratorFlowNode = Node<OrchestratorNodeData>
export type OrchestratorFlowEdge = Edge

export interface OrchestratorChain {
  id: number
  user_id: number
  name: string
  description: string | null
  is_public: number
  price_tc: number
  /** 1 если цепочка сохранена как шаблон ДЖАРВИС-советника (is_jarvis_template = 1 в БД) */
  is_jarvis_template: number
  nodes: OrchestratorFlowNode[]
  edges: OrchestratorFlowEdge[]
  created_at: number
  updated_at: number
}

export interface CreateOrUpdateChainInput {
  name: string
  description?: string
  isPublic?: boolean
  priceTc?: number
  nodes: OrchestratorFlowNode[]
  edges: OrchestratorFlowEdge[]
}

export interface NodeStatusEntry {
  nodeId: string
  status: OrchestratorNodeRunStatus
  output?: string
  error?: string
}

export interface OrchestratorExecution {
  id: number
  chain_id: number
  user_id: number
  status: OrchestratorExecutionStatus
  input: string | null
  output: string | null
  node_statuses: NodeStatusEntry[]
  cost_tc: number
  error: string | null
  started_at: number | null
  finished_at: number | null
  created_at: number
}

export interface RunChainResult {
  executionId: number
  cost: number
}

/** Пять типов событий, реально эмитируемых executeChain()/SSE-роутом — см. orchestrator.service.ts. */
export type OrchestratorStreamEvent =
  | { type: "node_start"; nodeId: string }
  | { type: "node_done"; nodeId: string; output: string }
  | { type: "node_error"; nodeId: string; error: string }
  | { type: "chain_done"; output: string }
  | { type: "chain_error"; error: string }
