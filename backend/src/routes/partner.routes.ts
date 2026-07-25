import { Router, Request, Response, NextFunction } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { logAudit } from "../lib/audit"
import { createGeneratedProject, PROJECT_SELECT_COLUMNS } from "../lib/project-generation"
import {
  generateApiKey,
  resolveApiKey,
  checkRateLimit,
  serializeApiKey,
  type ApiKeyRow,
} from "../lib/api-keys"

/* ================================================================
   OSGARD · B2B / white-label API (/api-keys + /v1)
   ----------------------------------------------------------------
   Два разных контура в одном файле:
     • partnerAdminRouter (/api-keys, requireAuth) — панель управления
       ключами в личном кабинете: выпуск, список, отзыв, статистика.
     • partnerPublicRouter (/v1, X-API-Key) — программный доступ для
       партнёров: генерация проектов по ключу с реальным списанием
       кредитов владельца и ограничением частоты.
   Генерация переиспользует общий сервис lib/project-generation.ts —
   ту же логику, что и веб-клиент, без расхождения экономики.
   ================================================================ */

/** Стоимость одной генерации через публичный API — списывается кредитами владельца ключа. */
const API_GENERATION_COST = 60

/* ================================================================
   Контур 1: управление ключами (личный кабинет, Bearer-JWT)
   ================================================================ */
export const partnerAdminRouter = Router()

/* ---------------- GET /api-keys — список своих ключей ---------------- */
partnerAdminRouter.get("/", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rows = db
    .prepare(`SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as ApiKeyRow[]

  const keys = rows.map((k) => {
    const usage = db
      .prepare(
        `SELECT COUNT(*) as calls, COALESCE(SUM(cost_credits), 0) as spent
         FROM api_key_usage WHERE api_key_id = ?`,
      )
      .get(k.id) as { calls: number; spent: number }
    return serializeApiKey(k, { calls: usage.calls, creditsSpent: usage.spent })
  })

  res.json({ keys, generationCost: API_GENERATION_COST })
})

/* ---------------- POST /api-keys — выпустить новый ключ ----------------
   Секрет возвращается ОДИН раз в поле `key`. Дальше — только префикс. */
partnerAdminRouter.post("/", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : ""
  const ratePerMin = Math.min(240, Math.max(1, Number(req.body?.ratePerMin) || 30))

  if (!name) return res.status(400).json({ error: "Укажите название ключа" })

  const activeCount = db
    .prepare(`SELECT COUNT(*) as c FROM api_keys WHERE user_id = ? AND status = 'active'`)
    .get(userId) as { c: number }
  if (activeCount.c >= 10) {
    return res.status(400).json({ error: "Достигнут лимит активных ключей (10). Отзовите неиспользуемые." })
  }

  const { raw, prefix, hash } = generateApiKey()
  const now = Date.now()
  const info = db
    .prepare(
      `INSERT INTO api_keys (user_id, name, prefix, key_hash, scopes, status, rate_per_min, request_count, created_at)
       VALUES (?, ?, ?, ?, 'generate', 'active', ?, 0, ?)`,
    )
    .run(userId, name, prefix, hash, ratePerMin, now)

  const row = db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(Number(info.lastInsertRowid)) as ApiKeyRow
  logAudit(userId, "credit", 0, "api_key_created", { keyId: row.id, name })

  res.status(201).json({ apiKey: serializeApiKey(row, { calls: 0, creditsSpent: 0 }), key: raw })
})

/* ---------------- POST /api-keys/:id/revoke — отозвать ключ ---------------- */
partnerAdminRouter.post("/:id/revoke", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const id = Number(req.params.id)
  const row = db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(id) as ApiKeyRow | undefined
  if (!row) return res.status(404).json({ error: "Ключ не найден" })
  if (row.user_id !== userId) return res.status(403).json({ error: "Это не ваш ключ" })
  if (row.status !== "active") return res.json({ apiKey: serializeApiKey(row) })

  db.prepare(`UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(Date.now(), id)
  logAudit(userId, "rejected", 0, "api_key_revoked", { keyId: id })

  const updated = db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(id) as ApiKeyRow
  res.json({ apiKey: serializeApiKey(updated) })
})

/* ---------------- GET /api-keys/:id/usage — журнал вызовов ключа ---------------- */
partnerAdminRouter.get("/:id/usage", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const id = Number(req.params.id)
  const row = db.prepare(`SELECT * FROM api_keys WHERE id = ?`).get(id) as ApiKeyRow | undefined
  if (!row) return res.status(404).json({ error: "Ключ не найден" })
  if (row.user_id !== userId) return res.status(403).json({ error: "Это не ваш ключ" })

  const events = db
    .prepare(
      `SELECT endpoint, project_id as projectId, cost_credits as costCredits, status, created_at as createdAt
       FROM api_key_usage WHERE api_key_id = ? ORDER BY created_at DESC LIMIT 100`,
    )
    .all(id)
  const totals = db
    .prepare(`SELECT COUNT(*) as calls, COALESCE(SUM(cost_credits), 0) as spent FROM api_key_usage WHERE api_key_id = ?`)
    .get(id) as { calls: number; spent: number }

  res.json({ key: serializeApiKey(row), events, totals })
})

/* ================================================================
   Контур 2: публичный API по ключу (X-API-Key)
   ================================================================ */
export const partnerPublicRouter = Router()

/** Middleware: аутентификация по заголовку X-API-Key. Кладёт ключ в res.locals.apiKey. */
function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const raw = (req.headers["x-api-key"] || req.headers["authorization"]) as string | undefined
  const token = raw?.startsWith("Bearer ") ? raw.slice(7) : raw
  const key = resolveApiKey(token)
  if (!key) {
    return res.status(401).json({ error: "Недействительный или отозванный API-ключ", code: "INVALID_API_KEY" })
  }
  const now = Date.now()
  if (!checkRateLimit(key.id, key.rate_per_min, now)) {
    res.setHeader("Retry-After", "60")
    return res.status(429).json({ error: "Превышен лимит запросов в минуту", code: "RATE_LIMITED", ratePerMin: key.rate_per_min })
  }
  res.locals.apiKey = key
  next()
}

/* ---------------- GET /v1/me — информация о ключе и владельце ---------------- */
partnerPublicRouter.get("/me", apiKeyAuth, (_req: Request, res: Response) => {
  const key = res.locals.apiKey as ApiKeyRow
  const wallet = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(key.user_id) as
    | { credits: number }
    | undefined
  res.json({
    key: serializeApiKey(key),
    credits: wallet?.credits ?? 0,
    generationCost: API_GENERATION_COST,
  })
})

/* ---------------- POST /v1/generate — сгенерировать проект по ключу ----------------
   Списывает кредиты владельца ключа и запускает ту же генерацию, что и веб-клиент. */
partnerPublicRouter.post("/generate", apiKeyAuth, asyncHandler(async (_req: Request, res: Response) => {
  const key = res.locals.apiKey as ApiKeyRow
  const body = _req.body || {}
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const hint = typeof body.hint === "string" ? body.hint : undefined
  const now = Date.now()

  if (!name) return res.status(400).json({ error: "Укажите name проекта", code: "NAME_REQUIRED" })

  /* Реальное списание кредитов владельца в транзакции. */
  const wallet = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(key.user_id) as
    | { credits: number }
    | undefined
  if (!wallet) return res.status(402).json({ error: "Кошелёк владельца не найден", code: "NO_WALLET" })
  if (wallet.credits < API_GENERATION_COST) {
    db.prepare(
      `INSERT INTO api_key_usage (api_key_id, endpoint, project_id, cost_credits, status, created_at)
       VALUES (?, 'generate', NULL, 0, 'insufficient_credits', ?)`,
    ).run(key.id, now)
    return res.status(402).json({
      error: `Недостаточно кредитов. Требуется ${API_GENERATION_COST}, доступно ${wallet.credits}.`,
      code: "INSUFFICIENT_CREDITS",
      required: API_GENERATION_COST,
      available: wallet.credits,
    })
  }

  let projectId = 0
  let project: any = null
  let artifacts: any[] = []

  db.exec("BEGIN IMMEDIATE")
  try {
    const fresh = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(key.user_id) as { credits: number }
    if (fresh.credits < API_GENERATION_COST) {
      db.exec("ROLLBACK")
      return res.status(402).json({ error: "Недостаточно кредитов", code: "INSUFFICIENT_CREDITS" })
    }
    db.prepare(`UPDATE wallets SET credits = credits - ?, updated_at = ? WHERE user_id = ?`).run(
      API_GENERATION_COST,
      now,
      key.user_id,
    )
    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'api_generation', ?, 'B2B API', ?, 'credits', 'done')`,
    ).run(key.user_id, `API-генерация: ${name}`, API_GENERATION_COST)
    db.prepare(`UPDATE api_keys SET request_count = request_count + 1, last_used_at = ? WHERE id = ?`).run(now, key.id)
    db.exec("COMMIT")
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }

  logAudit(key.user_id, "debit", API_GENERATION_COST, "api_generation", { keyId: key.id, name })

  /* Генерация проекта (та же, что у веб-клиента). Вне денежной транзакции. */
  try {
    const result = createGeneratedProject({ userId: key.user_id, name, hint })
    project = result.project
    artifacts = result.artifacts
    projectId = result.projectId
  } catch (err) {
    /* Генерация не удалась — возвращаем кредиты честно. */
    db.exec("BEGIN IMMEDIATE")
    try {
      db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`).run(
        API_GENERATION_COST,
        Date.now(),
        key.user_id,
      )
      db.prepare(
        `INSERT INTO api_key_usage (api_key_id, endpoint, project_id, cost_credits, status, created_at)
         VALUES (?, 'generate', NULL, 0, 'error', ?)`,
      ).run(key.id, Date.now())
      db.exec("COMMIT")
    } catch {
      db.exec("ROLLBACK")
    }
    logAudit(key.user_id, "credit", API_GENERATION_COST, "api_generation_refund", { keyId: key.id })
    throw err
  }

  db.prepare(
    `INSERT INTO api_key_usage (api_key_id, endpoint, project_id, cost_credits, status, created_at)
     VALUES (?, 'generate', ?, ?, 'ok', ?)`,
  ).run(key.id, projectId, API_GENERATION_COST, Date.now())

  res.status(202).json({
    project,
    artifacts,
    costCredits: API_GENERATION_COST,
    pollUrl: `/v1/projects/${projectId}`,
  })
}))

/* ---------------- GET /v1/projects/:id — статус проекта (для опроса) ---------------- */
partnerPublicRouter.get("/projects/:id", apiKeyAuth, (req: Request, res: Response) => {
  const key = res.locals.apiKey as ApiKeyRow
  const id = Number(req.params.id)
  const project: any = db.prepare(`SELECT ${PROJECT_SELECT_COLUMNS}, user_id as userId FROM projects WHERE id = ?`).get(id)
  if (!project || project.userId !== key.user_id) {
    return res.status(404).json({ error: "Проект не найден", code: "NOT_FOUND" })
  }
  delete project.userId
  const artifacts = db
    .prepare(
      `SELECT id, name, type, rarity, level, power, defense, magic, speed, price, list_currency as listCurrency
       FROM artifacts WHERE project_id = ? ORDER BY created_at DESC`,
    )
    .all(id)
  res.json({ project, artifacts })
})
