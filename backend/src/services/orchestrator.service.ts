import { EventEmitter } from "node:events"
import db from "../lib/db"
import { runNode, type OrchestratorNodeConfig, type OrchestratorNodeType, type ChainContext } from "./orchestrator-nodes"

/* ================================================================
   OSGARD · Оркестратор — сервис
   ----------------------------------------------------------------
   createChain   — валидирует граф и сохраняет «змею» в orchestrator_chains.
   validateGraph — топологическая сортировка (Kahn) для проверки на
                   циклы + лимит числа узлов. Вызывается и при сохранении
                   (createChain), и заново перед каждым запуском
                   (executeChain), т.к. граф мог быть отредактирован
                   в обход createChain (напрямую через будущий PUT).
   executeChain  — последовательно прогоняет узлы через runNode(),
                   пишет прогресс в orchestrator_executions и рассылает
                   события через executionEvents (потребитель — будущий
                   SSE-роут `GET /orchestrator/stream/:executionId`).

   Выполнение — in-process (без очереди/BullMQ): для цепочек ≤20 узлов
   и общего таймаута 5 минут отдельный джоб-раннер избыточен на этапе
   MVP, а Redis в проекте — опциональная best-effort зависимость
   (см. lib/redis.ts), поэтому оркестратор не должен требовать его
   для базовой работы.
   ================================================================ */

export const executionEvents = new EventEmitter()

export const MAX_NODES = 20
const CHAIN_TIMEOUT_MS = 5 * 60_000

export interface OrchestratorGraphNode {
  id: string
  data: OrchestratorNodeConfig
}

export interface OrchestratorGraphEdge {
  source: string
  target: string
}

export interface CreateChainInput {
  name: string
  description?: string
  isPublic?: boolean
  priceTc?: number
  nodes: OrchestratorGraphNode[]
  edges: OrchestratorGraphEdge[]
}

export interface OrchestratorChainRow {
  id: number
  user_id: number
  name: string
  description: string | null
  is_public: number
  price_tc: number
  nodes: OrchestratorGraphNode[]
  edges: OrchestratorGraphEdge[]
  created_at: number
  updated_at: number
}

type NodeStatus = "pending" | "running" | "done" | "error"

interface NodeStatusEntry {
  nodeId: string
  status: NodeStatus
  output?: string
  error?: string
}

export class GraphValidationError extends Error {}

/**
 * Топологическая сортировка (Kahn's algorithm). Бросает GraphValidationError
 * при цикле, висячей связи (edge на несуществующий узел) или превышении
 * лимита узлов. Возвращает узлы в порядке выполнения.
 */
export function validateGraph(nodes: OrchestratorGraphNode[], edges: OrchestratorGraphEdge[]): OrchestratorGraphNode[] {
  if (nodes.length === 0) throw new GraphValidationError("empty_graph")
  if (nodes.length > MAX_NODES) throw new GraphValidationError("too_many_nodes")

  const nodeIds = new Set(nodes.map((n) => n.id))
  if (nodeIds.size !== nodes.length) throw new GraphValidationError("duplicate_node_id")

  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const adjacency = new Map<string, string[]>(nodes.map((n) => [n.id, []]))

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new GraphValidationError("dangling_edge")
    }
    adjacency.get(edge.source)!.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const queue = nodes.filter((n) => indegree.get(n.id) === 0).map((n) => n.id)
  const order: string[] = []

  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const next of adjacency.get(id) ?? []) {
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }

  if (order.length !== nodes.length) throw new GraphValidationError("cycle_detected")

  const byId = new Map(nodes.map((n) => [n.id, n]))
  return order.map((id) => byId.get(id)!)
}

function rowToChain(row: any): OrchestratorChainRow {
  return {
    ...row,
    nodes: JSON.parse(row.nodes),
    edges: JSON.parse(row.edges),
  }
}

export function createChain(userId: number, input: CreateChainInput): OrchestratorChainRow {
  validateGraph(input.nodes, input.edges)

  const now = Date.now()
  const result = db
    .prepare(
      `INSERT INTO orchestrator_chains (user_id, name, description, is_public, price_tc, nodes, edges, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      input.name,
      input.description ?? null,
      input.isPublic ? 1 : 0,
      input.priceTc ?? 0,
      JSON.stringify(input.nodes),
      JSON.stringify(input.edges),
      now,
      now,
    )

  const row = db.prepare(`SELECT * FROM orchestrator_chains WHERE id = ?`).get(result.lastInsertRowid)
  return rowToChain(row)
}

/**
 * Прогоняет цепочку узлов последовательно: выход узла N — вход узла N+1.
 * Пишет прогресс в orchestrator_executions и эмитит события `exec:${executionId}`
 * ({ type: "node_start" | "node_done" | "node_error" | "chain_done" | "chain_error", ... }).
 * Бросает исключение при ошибке/таймауте узла или превышении общего таймаута цепочки —
 * вызывающий код (роут запуска) должен считать это провалом всей цепочки.
 */
export async function executeChain(
  executionId: number,
  nodes: OrchestratorGraphNode[],
  edges: OrchestratorGraphEdge[],
  input: string,
): Promise<string> {
  const order = validateGraph(nodes, edges)
  const channel = `exec:${executionId}`
  const deadline = Date.now() + CHAIN_TIMEOUT_MS

  const statuses: NodeStatusEntry[] = order.map((n) => ({ nodeId: n.id, status: "pending" }))
  const persist = (patch: Partial<{ status: string; output: string; error: string; finished_at: number }>) => {
    const fields = Object.keys(patch)
    if (fields.length === 0) return
    const setClause = fields.map((f) => `${f} = ?`).join(", ")
    db.prepare(`UPDATE orchestrator_executions SET ${setClause}, node_statuses = ? WHERE id = ?`).run(
      ...fields.map((f) => (patch as any)[f]),
      JSON.stringify(statuses),
      executionId,
    )
  }

  db.prepare(`UPDATE orchestrator_executions SET status = 'running', started_at = ?, node_statuses = ? WHERE id = ?`).run(
    Date.now(),
    JSON.stringify(statuses),
    executionId,
  )

  let current = input
  let context: ChainContext = {}

  for (let i = 0; i < order.length; i++) {
    const node = order[i]
    const entry = statuses[i]

    if (Date.now() > deadline) {
      entry.status = "error"
      entry.error = "chain_timeout"
      persist({ status: "error", error: "chain_timeout", finished_at: Date.now() })
      executionEvents.emit(channel, { type: "chain_error", error: "chain_timeout" })
      throw new Error("chain_timeout")
    }

    entry.status = "running"
    persist({})
    executionEvents.emit(channel, { type: "node_start", nodeId: node.id })

    try {
      const { output, context: nextContext } = await runNode(node.data, current, context)
      current = output
      context = nextContext
      entry.status = "done"
      entry.output = output
      persist({})
      executionEvents.emit(channel, { type: "node_done", nodeId: node.id, output })
    } catch (err: any) {
      entry.status = "error"
      entry.error = err?.message ?? "node_failed"
      persist({ status: "error", error: entry.error, finished_at: Date.now() })
      executionEvents.emit(channel, { type: "node_error", nodeId: node.id, error: entry.error })
      executionEvents.emit(channel, { type: "chain_error", error: entry.error })
      throw err
    }
  }

  persist({ status: "success", output: current, finished_at: Date.now() })
  executionEvents.emit(channel, { type: "chain_done", output: current })
  return current
}
