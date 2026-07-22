import { EventEmitter } from "node:events"
import db from "../lib/db"
import { runNode, type OrchestratorNodeConfig, type OrchestratorNodeType, type ChainContext } from "./orchestrator-nodes"
import { logAudit } from "../lib/audit"
import { captureError } from "../lib/sentry"

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

/** Стоимость запуска одного узла в TimeCoin — списывается со всей цепочки перед запуском. */
const NODE_COST_TC: Record<OrchestratorNodeType, number> = {
  claude: 5,
  deepseek: 1,
  grok: 2,
  prompt_template: 0,
}

export function calculateChainCost(nodes: OrchestratorGraphNode[]): number {
  return nodes.reduce((sum, n) => sum + (NODE_COST_TC[n.data.type] ?? 0), 0)
}

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
  is_jarvis_template: number
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

export function rowToChain(row: any): OrchestratorChainRow {
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

export function listChains(userId: number): OrchestratorChainRow[] {
  const rows = db.prepare(`SELECT * FROM orchestrator_chains WHERE user_id = ? ORDER BY created_at DESC`).all(userId)
  return rows.map(rowToChain)
}

export function getChain(userId: number, chainId: number): OrchestratorChainRow | null {
  const row = db.prepare(`SELECT * FROM orchestrator_chains WHERE id = ? AND user_id = ?`).get(chainId, userId)
  return row ? rowToChain(row) : null
}

/**
 * Ищет цепочку по имени (без учёта регистра) — для команд ДЖАРВИСА вида
 * «запусти цепочку "Анализ рынка"». Сначала смотрит среди цепочек самого
 * пользователя, затем — среди публичных шаблонов ДЖАРВИСА (доступны всем).
 */
export function findChainByName(userId: number, name: string): OrchestratorChainRow | null {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return null

  const row = db
    .prepare(
      `SELECT * FROM orchestrator_chains
       WHERE LOWER(name) = ?
         AND (user_id = ? OR (is_public = 1 AND is_jarvis_template = 1))
       ORDER BY (user_id = ?) DESC, updated_at DESC
       LIMIT 1`,
    )
    .get(normalized, userId, userId)

  return row ? rowToChain(row) : null
}

/** Публичные цепочки, отмеченные ДЖАРВИСОМ как шаблон — пул для рекомендаций другим пользователям. */
export function listJarvisTemplates(): OrchestratorChainRow[] {
  const rows = db
    .prepare(`SELECT * FROM orchestrator_chains WHERE is_public = 1 AND is_jarvis_template = 1 ORDER BY created_at DESC`)
    .all()
  return rows.map(rowToChain)
}

/** Публикует свою цепочку как шаблон ДЖАРВИСА (делает публичной + помечает is_jarvis_template). */
export function saveChainAsJarvisTemplate(userId: number, chainId: number): OrchestratorChainRow | null {
  const result = db
    .prepare(
      `UPDATE orchestrator_chains SET is_public = 1, is_jarvis_template = 1, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .run(Date.now(), chainId, userId)

  if (result.changes === 0) return null
  const row = db.prepare(`SELECT * FROM orchestrator_chains WHERE id = ?`).get(chainId)
  return rowToChain(row)
}

/** Полная замена графа/метаданных (PUT-семантика) с повторной валидацией. Возвращает null, если цепочка не найдена/чужая. */
export function updateChain(userId: number, chainId: number, input: CreateChainInput): OrchestratorChainRow | null {
  validateGraph(input.nodes, input.edges)

  const now = Date.now()
  const result = db
    .prepare(
      `UPDATE orchestrator_chains
       SET name = ?, description = ?, is_public = ?, price_tc = ?, nodes = ?, edges = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .run(
      input.name,
      input.description ?? null,
      input.isPublic ? 1 : 0,
      input.priceTc ?? 0,
      JSON.stringify(input.nodes),
      JSON.stringify(input.edges),
      now,
      chainId,
      userId,
    )

  if (result.changes === 0) return null
  const row = db.prepare(`SELECT * FROM orchestrator_chains WHERE id = ?`).get(chainId)
  return rowToChain(row)
}

export function deleteChain(userId: number, chainId: number): boolean {
  const result = db.prepare(`DELETE FROM orchestrator_chains WHERE id = ? AND user_id = ?`).run(chainId, userId)
  return result.changes > 0
}

/** Создаёт запись запуска (status='pending'). Вызывается внутри той же транзакции, что и списание TC. */
export function createExecution(chainId: number, userId: number, input: string, costTc: number): number {
  const result = db
    .prepare(
      `INSERT INTO orchestrator_executions (chain_id, user_id, status, input, cost_tc, created_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
    )
    .run(chainId, userId, input, costTc, Date.now())
  return Number(result.lastInsertRowid)
}

export type RunChainResult =
  | { executionId: number; cost: number }
  | { error: "insufficient_balance"; cost: number; available: number }

/**
 * Списывает TimeCoin и запускает цепочку — общая транзакционная логика,
 * которую используют и REST-роут POST /orchestrator/chains/:id/run, и
 * команда ДЖАРВИСА «запусти цепочку X» (jarvis.service.ts), чтобы не
 * дублировать финансовую операцию в двух местах и не рисковать их
 * рассинхронизацией.
 */
export function runChainForUser(userId: number, chain: OrchestratorChainRow, input: string): RunChainResult {
  const cost = calculateChainCost(chain.nodes)
  let executionId: number

  db.exec("BEGIN IMMEDIATE")
  try {
    const debit = db
      .prepare(`UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ? AND timecoin >= ?`)
      .run(cost, Date.now(), userId, cost)

    if (debit.changes !== 1) {
      db.exec("ROLLBACK")
      const wallet: any = db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(userId)
      logAudit(userId, "rejected", cost, "insufficient_balance", { chainId: chain.id, balance: wallet?.timecoin ?? 0 })
      return { error: "insufficient_balance", cost, available: wallet?.timecoin ?? 0 }
    }

    executionId = createExecution(chain.id, userId, input, cost)
    logAudit(userId, "debit", cost, "orchestrator_chain_run", { chainId: chain.id })
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }

  // Запуск не блокирует ответ — прогресс идёт в фоне (SSE/следующий опрос).
  executeChain(executionId, chain.nodes, chain.edges, input).catch((err) => {
    captureError(`[orchestrator] execution ${executionId} failed:`, err)
  })

  return { executionId, cost }
}

export interface OrchestratorExecutionRow {
  id: number
  chain_id: number
  user_id: number
  status: string
  input: string | null
  output: string | null
  node_statuses: any[]
  cost_tc: number
  error: string | null
  started_at: number | null
  finished_at: number | null
  created_at: number
}

export function getExecution(userId: number, executionId: number): OrchestratorExecutionRow | null {
  const row: any = db.prepare(`SELECT * FROM orchestrator_executions WHERE id = ? AND user_id = ?`).get(executionId, userId)
  if (!row) return null
  return { ...row, node_statuses: JSON.parse(row.node_statuses) }
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
