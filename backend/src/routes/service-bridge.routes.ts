import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { rateLimit } from "../middleware/rateLimiter"
import { logAudit } from "../lib/audit"
import { planLevel, type PlanKey } from "../lib/stripe"
import { getServiceBridgeLimit, getServiceBridgeUsage, incrementServiceBridgeUsage, isServiceBridgeLimitExceeded } from "../lib/integrationsQuota"
import {
  CONNECTORS,
  getConnector,
  getConnectorAction,
  listConnectorsPublic,
} from "../services/service-bridge/connector-registry"
import {
  encryptConfig,
  redactConfig,
  runIntegrationAction,
  getIntegrationTestAction,
  ServiceBridgeError,
  type IntegrationRow,
} from "../services/service-bridge/service-bridge-engine"
import { generateActionSnippet } from "../services/service-bridge/code-generator"

/* ================================================================
   OSGARD · Service Bridge — REST API
   ----------------------------------------------------------------
   /integrations/connectors        — публичный каталог коннекторов
   /integrations                   — CRUD подключений пользователя
   /integrations/:id/test          — тестовый вызов (не тратит квоту)
   /integrations/:id/execute       — обычный вызов действия (тратит квоту)
   /integrations/:id/logs          — журнал вызовов
   /integrations/:id/code          — сгенерированный пример кода
   ================================================================ */

const router = Router()

function getUserRow(userId: number): { plan: PlanKey } {
  const row: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
  return { plan: row?.plan ?? "free" }
}

function loadIntegration(userId: number, id: number): IntegrationRow | undefined {
  return db.prepare(`SELECT * FROM integrations WHERE id = ? AND user_id = ?`).get(id, userId) as IntegrationRow | undefined
}

function toPublicIntegration(row: IntegrationRow) {
  const connector = getConnector(row.connector_id)
  return {
    id: row.id,
    connectorId: row.connector_id,
    connectorName: connector?.name ?? row.connector_id,
    name: row.name,
    status: row.status,
    lastTestAt: row.last_test_at,
    lastTestStatus: row.last_test_status,
    lastTestError: row.last_test_error,
    config: connector ? redactConfig(connector, row.config) : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ---------------- GET /integrations/connectors ---------------- */
router.get("/connectors", requireAuth, (_req: AuthRequest, res) => {
  res.json({ connectors: listConnectorsPublic() })
})

/* ---------------- GET /integrations ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const rows = db
    .prepare(`SELECT * FROM integrations WHERE user_id = ? ORDER BY created_at DESC`)
    .all(req.user!.userId) as unknown as IntegrationRow[]
  res.json({ integrations: rows.map(toPublicIntegration) })
})

/* ---------------- GET /integrations/meta/remaining ---------------- */
router.get(
  "/meta/remaining",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const { plan } = getUserRow(userId)
    const limit = getServiceBridgeLimit(plan)
    const usage = await getServiceBridgeUsage(userId)
    res.json({
      remaining: limit === null ? null : Math.max(0, limit - usage),
      total: limit,
      isPaid: planLevel(plan) >= planLevel("pro"),
    })
  }),
)

/* ---------------- GET /integrations/:id ---------------- */
router.get("/:id", requireAuth, (req: AuthRequest, res) => {
  const row = loadIntegration(req.user!.userId, Number(req.params.id))
  if (!row) return res.status(404).json({ error: "Интеграция не найдена" })
  res.json({ integration: toPublicIntegration(row) })
})

/* ---------------- POST /integrations ---------------- */
router.post(
  "/",
  requireAuth,
  rateLimit(60_000, 20),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const { connectorId, name, config } = req.body ?? {}

    if (typeof connectorId !== "string" || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Укажите connectorId и name", code: "INVALID_INPUT" })
    }

    const connector = getConnector(connectorId)
    if (!connector) return res.status(400).json({ error: "Неизвестный коннектор", code: "UNKNOWN_CONNECTOR" })

    const { plan } = getUserRow(userId)
    const countRow: any = db.prepare(`SELECT COUNT(*) as c FROM integrations WHERE user_id = ?`).get(userId)
    const maxIntegrations = plan === "free" ? 3 : plan === "pro" ? 10 : 50
    if (countRow.c >= maxIntegrations) {
      return res.status(403).json({
        error: `Достигнут лимит интеграций для вашего тарифа (${maxIntegrations})`,
        code: "INTEGRATIONS_LIMIT",
        upgradeRequired: true,
      })
    }

    let configJson: string
    try {
      configJson = encryptConfig(connector, config ?? {})
    } catch (err: any) {
      if (err instanceof ServiceBridgeError) {
        return res.status(400).json({ error: `Отсутствует обязательное поле: ${err.message.split(":")[1]}`, code: "MISSING_FIELD" })
      }
      throw err
    }

    const now = Date.now()
    const result = db
      .prepare(
        `INSERT INTO integrations (user_id, connector_id, name, config, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'active', ?, ?)`,
      )
      .run(userId, connectorId, name.trim(), configJson, now, now)

    logAudit(userId, "credit", 0, "integration_created", { connectorId, integrationId: result.lastInsertRowid })

    const row = loadIntegration(userId, Number(result.lastInsertRowid))!
    res.status(201).json({ integration: toPublicIntegration(row) })
  }),
)

/* ---------------- PATCH /integrations/:id ---------------- */
router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const row = loadIntegration(userId, Number(req.params.id))
    if (!row) return res.status(404).json({ error: "Интеграция не найдена" })

    const connector = getConnector(row.connector_id)
    if (!connector) return res.status(400).json({ error: "Неизвестный коннектор", code: "UNKNOWN_CONNECTOR" })

    const { name, config, status } = req.body ?? {}
    const updates: string[] = []
    const values: any[] = []

    if (typeof name === "string" && name.trim()) {
      updates.push("name = ?")
      values.push(name.trim())
    }
    if (config && typeof config === "object") {
      const merged = { ...redactConfig(connector, row.config), ...config }
      let configJson: string
      try {
        configJson = encryptConfig(connector, merged)
      } catch (err: any) {
        if (err instanceof ServiceBridgeError) {
          return res.status(400).json({ error: `Отсутствует обязательное поле: ${err.message.split(":")[1]}`, code: "MISSING_FIELD" })
        }
        throw err
      }
      updates.push("config = ?")
      values.push(configJson)
    }
    if (status === "active" || status === "disabled") {
      updates.push("status = ?")
      values.push(status)
    }

    if (updates.length === 0) return res.status(400).json({ error: "Нечего обновлять" })

    updates.push("updated_at = ?")
    values.push(Date.now())
    values.push(row.id)

    db.prepare(`UPDATE integrations SET ${updates.join(", ")} WHERE id = ?`).run(...values)

    const updated = loadIntegration(userId, row.id)!
    res.json({ integration: toPublicIntegration(updated) })
  }),
)

/* ---------------- DELETE /integrations/:id ---------------- */
router.delete("/:id", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const row = loadIntegration(userId, Number(req.params.id))
  if (!row) return res.status(404).json({ error: "Интеграция не найдена" })

  db.prepare(`DELETE FROM integrations WHERE id = ?`).run(row.id)
  db.prepare(`DELETE FROM integration_logs WHERE integration_id = ?`).run(row.id)
  logAudit(userId, "credit", 0, "integration_deleted", { integrationId: row.id })
  res.json({ success: true })
})

/* ---------------- POST /integrations/:id/test ---------------- */
router.post(
  "/:id/test",
  requireAuth,
  rateLimit(60_000, 30),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const row = loadIntegration(userId, Number(req.params.id))
    if (!row) return res.status(404).json({ error: "Интеграция не найдена" })

    const connector = getConnector(row.connector_id)
    if (!connector) return res.status(400).json({ error: "Неизвестный коннектор", code: "UNKNOWN_CONNECTOR" })

    const action = getIntegrationTestAction(connector)
    if (!action) return res.status(400).json({ error: "Для коннектора нет доступных действий" })

    const result = await runIntegrationAction(row, action.id, {}, { isTest: true })
    res.json({ result })
  }),
)

/* ---------------- POST /integrations/:id/execute ---------------- */
router.post(
  "/:id/execute",
  requireAuth,
  rateLimit(60_000, 60),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const row = loadIntegration(userId, Number(req.params.id))
    if (!row) return res.status(404).json({ error: "Интеграция не найдена" })

    if (row.status !== "active") {
      return res.status(400).json({ error: "Интеграция отключена", code: "INTEGRATION_DISABLED" })
    }

    const connector = getConnector(row.connector_id)
    if (!connector) return res.status(400).json({ error: "Неизвестный коннектор", code: "UNKNOWN_CONNECTOR" })

    const { actionId, params } = req.body ?? {}
    const action = typeof actionId === "string" ? getConnectorAction(connector, actionId) : undefined
    if (!action) return res.status(400).json({ error: "Неизвестное действие", code: "UNKNOWN_ACTION" })

    const { plan } = getUserRow(userId)
    if (await isServiceBridgeLimitExceeded(userId, plan)) {
      const limit = getServiceBridgeLimit(plan)
      return res.status(429).json({
        error: `Вы использовали все ${limit} вызовов интеграций на сегодня`,
        code: "QUOTA_EXCEEDED",
        upgradeRequired: plan !== "elite",
      })
    }

    const result = await runIntegrationAction(row, action.id, params ?? {})
    await incrementServiceBridgeUsage(userId)

    res.json({ result })
  }),
)

/* ---------------- GET /integrations/:id/logs ---------------- */
router.get("/:id/logs", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const row = loadIntegration(userId, Number(req.params.id))
  if (!row) return res.status(404).json({ error: "Интеграция не найдена" })

  const limit = Math.min(Number(req.query.limit) || 50, 200)
  const logs = db
    .prepare(`SELECT * FROM integration_logs WHERE integration_id = ? ORDER BY created_at DESC LIMIT ?`)
    .all(row.id, limit)

  res.json({ logs })
})

/* ---------------- GET /integrations/:id/code ---------------- */
router.get("/:id/code", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const row = loadIntegration(userId, Number(req.params.id))
  if (!row) return res.status(404).json({ error: "Интеграция не найдена" })

  const connector = getConnector(row.connector_id)
  if (!connector) return res.status(400).json({ error: "Неизвестный коннектор", code: "UNKNOWN_CONNECTOR" })

  const actionId = String(req.query.actionId ?? "")
  const action = getConnectorAction(connector, actionId) ?? connector.actions[0]
  if (!action) return res.status(400).json({ error: "Для коннектора нет доступных действий" })

  res.json({ code: generateActionSnippet(connector, action), actionId: action.id })
})

export default router
