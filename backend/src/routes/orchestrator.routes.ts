import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import {
  createChain,
  listChains,
  getChain,
  updateChain,
  deleteChain,
  createExecution,
  getExecution,
  executeChain,
  executionEvents,
  calculateChainCost,
  GraphValidationError,
  MAX_NODES,
  type CreateChainInput,
  type OrchestratorGraphNode,
  type OrchestratorGraphEdge,
} from "../services/orchestrator.service"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"
import { asyncHandler } from "../utils/async-handler"
import { requirePlan } from "./subscription.routes"
import { ORCHESTRATOR_DAILY_LIMIT, getOrchestratorUsage, incrementOrchestratorUsage } from "../lib/orchestratorQuota"
import type { PlanKey } from "../lib/stripe"

/* Оркестратор — платная фича: доступ только подписчикам master/legend
   (см. requirePlan — иерархическая проверка уровня плана) плюс общий
   дневной лимит запусков цепочек (см. orchestratorQuota.ts). */
const ORCHESTRATOR_GATE_PLAN: PlanKey = "master"

const router = Router()

let activeSseConnections = 0
export function getActiveSseConnections(): number {
  return activeSseConnections
}

/* ================================================================
   OSGARD · Оркестратор — REST API, SSE-статус, биллинг
   ----------------------------------------------------------------
   CRUD цепочек + запуск с атомарным списанием TimeCoin + SSE-поток
   прогресса выполнения (потребляет executionEvents из orchestrator.service).
   ================================================================ */

const GRAPH_ERROR_MESSAGES: Record<string, string> = {
  empty_graph: "Цепочка должна содержать хотя бы один узел",
  too_many_nodes: `Слишком много узлов (максимум ${MAX_NODES})`,
  duplicate_node_id: "Дублирующийся id узла",
  dangling_edge: "Ребро ссылается на несуществующий узел",
  cycle_detected: "Граф цепочки содержит цикл",
}

function graphErrorMessage(err: GraphValidationError): string {
  return GRAPH_ERROR_MESSAGES[err.message] ?? "Некорректный граф цепочки"
}

function parseChainInput(body: any): { input?: CreateChainInput; error?: string } {
  const { name, description, isPublic, priceTc, nodes, edges } = body || {}

  if (!name || typeof name !== "string") {
    return { error: "Укажите название цепочки" }
  }
  if (!Array.isArray(nodes)) {
    return { error: "Поле nodes должно быть массивом" }
  }
  if (!Array.isArray(edges)) {
    return { error: "Поле edges должно быть массивом" }
  }

  return {
    input: {
      name,
      description: typeof description === "string" ? description : undefined,
      isPublic: Boolean(isPublic),
      priceTc: typeof priceTc === "number" && priceTc >= 0 ? priceTc : 0,
      nodes: nodes as OrchestratorGraphNode[],
      edges: edges as OrchestratorGraphEdge[],
    },
  }
}

/* ---------------- POST /orchestrator/chains ---------------- */
router.post("/chains", requireAuth, (req: AuthRequest, res) => {
  const { input, error } = parseChainInput(req.body)
  if (error || !input) return res.status(400).json({ error })

  try {
    const chain = createChain(req.user!.userId, input)
    res.status(201).json({ chain })
  } catch (err) {
    if (err instanceof GraphValidationError) {
      return res.status(400).json({ error: graphErrorMessage(err) })
    }
    throw err
  }
})

/* ---------------- GET /orchestrator/chains ---------------- */
router.get("/chains", requireAuth, (req: AuthRequest, res) => {
  const chains = listChains(req.user!.userId)
  res.json({ chains })
})

/* ---------------- GET /orchestrator/chains/:id ---------------- */
router.get("/chains/:id", requireAuth, (req: AuthRequest, res) => {
  const chain = getChain(req.user!.userId, Number(req.params.id))
  if (!chain) return res.status(404).json({ error: "Цепочка не найдена" })
  res.json({ chain })
})

/* ---------------- PUT /orchestrator/chains/:id ---------------- */
router.put("/chains/:id", requireAuth, (req: AuthRequest, res) => {
  const { input, error } = parseChainInput(req.body)
  if (error || !input) return res.status(400).json({ error })

  try {
    const chain = updateChain(req.user!.userId, Number(req.params.id), input)
    if (!chain) return res.status(404).json({ error: "Цепочка не найдена" })
    res.json({ chain })
  } catch (err) {
    if (err instanceof GraphValidationError) {
      return res.status(400).json({ error: graphErrorMessage(err) })
    }
    throw err
  }
})

/* ---------------- DELETE /orchestrator/chains/:id ---------------- */
router.delete("/chains/:id", requireAuth, (req: AuthRequest, res) => {
  const ok = deleteChain(req.user!.userId, Number(req.params.id))
  if (!ok) return res.status(404).json({ error: "Цепочка не найдена" })
  res.json({ success: true })
})

/* ---------------- POST /orchestrator/chains/:id/run ---------------- */
router.post(
  "/chains/:id/run",
  requireAuth,
  requirePlan(ORCHESTRATOR_GATE_PLAN),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const chain = getChain(userId, Number(req.params.id))
    if (!chain) return res.status(404).json({ error: "Цепочка не найдена" })

    const input = req.body?.input
    if (typeof input !== "string" || !input.trim()) {
      return res.status(400).json({ error: "Укажите вход цепочки (поле input)" })
    }

    const usage = await getOrchestratorUsage(userId)
    if (usage >= ORCHESTRATOR_DAILY_LIMIT) {
      return res.status(429).json({ error: `Вы использовали все ${ORCHESTRATOR_DAILY_LIMIT} запросов на сегодня` })
    }

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
        return res.status(400).json({
          error: `Недостаточно TimeCoin (нужно ${cost}, доступно ${wallet?.timecoin ?? 0})`,
        })
      }

      executionId = createExecution(chain.id, userId, input, cost)
      logAudit(userId, "debit", cost, "orchestrator_chain_run", { chainId: chain.id })
      db.exec("COMMIT")
    } catch (err) {
      db.exec("ROLLBACK")
      throw err
    }

    await incrementOrchestratorUsage(userId)

    // Запуск не блокирует ответ — клиент подключается к SSE для отслеживания прогресса.
    executeChain(executionId, chain.nodes, chain.edges, input).catch((err) => {
      captureError(`[orchestrator] execution ${executionId} failed:`, err)
    })

    res.status(202).json({ executionId, cost })
  }),
)

/* ---------------- GET /orchestrator/remaining ---------------- */
router.get(
  "/remaining",
  requireAuth,
  requirePlan(ORCHESTRATOR_GATE_PLAN),
  asyncHandler(async (req: AuthRequest, res) => {
    const usage = await getOrchestratorUsage(req.user!.userId)
    res.json({ remaining: Math.max(0, ORCHESTRATOR_DAILY_LIMIT - usage), total: ORCHESTRATOR_DAILY_LIMIT })
  }),
)

/* ---------------- GET /orchestrator/stream/:executionId (SSE) ---------------- */
router.get("/stream/:executionId", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const executionId = Number(req.params.executionId)
  const execution = getExecution(userId, executionId)
  if (!execution) return res.status(404).json({ error: "Запуск не найден" })

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  })

  const send = (event: unknown) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }

  if (execution.status === "success" || execution.status === "error") {
    send(
      execution.status === "success"
        ? { type: "chain_done", output: execution.output }
        : { type: "chain_error", error: execution.error },
    )
    return res.end()
  }

  const channel = `exec:${executionId}`
  const onEvent = (event: any) => {
    send(event)
    if (event.type === "chain_done" || event.type === "chain_error") {
      cleanup()
      res.end()
    }
  }

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
  const cleanup = () => {
    clearInterval(heartbeat)
    executionEvents.off(channel, onEvent)
    activeSseConnections--
  }

  activeSseConnections++
  executionEvents.on(channel, onEvent)
  req.on("close", cleanup)
})

/* ---------------- POST /orchestrator/chains/:id/jarvis-template ---------------- */
router.post(
  "/chains/:id/jarvis-template",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const chainId = Number(req.params.id)
    const chain = getChain(userId, chainId)
    if (!chain) return res.status(404).json({ error: "Цепочка не найдена" })

    db.prepare(
      `UPDATE orchestrator_chains
       SET is_jarvis_template = 1, is_public = 1, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(Date.now(), chainId, userId)

    const updated = getChain(userId, chainId)
    res.json({ chain: updated })
  }),
)

/* ---------------- DELETE /orchestrator/chains/:id/jarvis-template ---------------- */
router.delete(
  "/chains/:id/jarvis-template",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const chainId = Number(req.params.id)
    const chain = getChain(userId, chainId)
    if (!chain) return res.status(404).json({ error: "Цепочка не найдена" })

    db.prepare(
      `UPDATE orchestrator_chains
       SET is_jarvis_template = 0, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    ).run(Date.now(), chainId, userId)

    res.json({ success: true })
  }),
)

/* ---------------- GET /orchestrator/executions/:id ---------------- */
router.get("/executions/:id", requireAuth, (req: AuthRequest, res) => {
  const execution = getExecution(req.user!.userId, Number(req.params.id))
  if (!execution) return res.status(404).json({ error: "Запуск не найден" })
  res.json({ execution })
})

export default router
