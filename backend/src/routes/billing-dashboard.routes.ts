import { Router } from "express"
import db from "../lib/db"
import { requireAdmin } from "../middleware/admin.middleware"
import { asyncHandler } from "../utils/async-handler"

/* ================================================================
   OSGARD · Admin billing dashboard (выручка / активные подписки / churn)
   ----------------------------------------------------------------
   Отдельный роут-файл, не трогает controllers/admin.controller.ts —
   тот принадлежит параллельной задаче другого инстанса. requireAdmin
   переиспользуется как есть (стабильный shared middleware).
   ================================================================ */

const router = Router()

router.use(requireAdmin)

const DAY_MS = 24 * 60 * 60 * 1000
const CHURN_WINDOW_MS = 30 * DAY_MS

/* transactions.created_at в свежей БД — INTEGER (мс), но в проде исторически
   встречается TEXT (см. admin.controller.ts::normalizedTs) — дублируем тот же
   приём локально, а не импортируем из чужого файла. */
function normalizedTs(col: string): string {
  return `(CASE WHEN typeof(${col}) = 'text' THEN CAST(strftime('%s', ${col}) AS INTEGER) * 1000 ELSE ${col} END)`
}

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const now = Date.now()
    const churnSince = now - CHURN_WINDOW_MS

    const totalRevenue = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) as total FROM transactions
           WHERE currency = 'cash_usd' AND status = 'done'`,
        )
        .get() as { total: number }
    ).total

    const revenueByType = db
      .prepare(
        `SELECT type, COALESCE(SUM(amount), 0) as total FROM transactions
         WHERE currency = 'cash_usd' AND status = 'done'
         GROUP BY type ORDER BY total DESC`,
      )
      .all() as { type: string; total: number }[]

    const activeByPlan = db
      .prepare(
        `SELECT plan, COUNT(*) as count FROM subscriptions
         WHERE status IN ('active', 'trialing') AND plan != 'free'
         GROUP BY plan ORDER BY count DESC`,
      )
      .all() as { plan: string; count: number }[]

    const activeSubscriptions = activeByPlan.reduce((sum, row) => sum + row.count, 0)

    const canceledLast30d = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM subscriptions
           WHERE status = 'canceled' AND canceled_at IS NOT NULL AND canceled_at >= ?`,
        )
        .get(churnSince) as { c: number }
    ).c

    const churnRate =
      activeSubscriptions + canceledLast30d > 0
        ? Math.round((canceledLast30d / (activeSubscriptions + canceledLast30d)) * 1000) / 10
        : 0

    const failedPayments30d = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM transactions
           WHERE currency = 'cash_usd' AND status = 'failed' AND ${normalizedTs("created_at")} >= ?`,
        )
        .get(now - CHURN_WINDOW_MS) as { c: number }
    ).c

    const recentTransactions = db
      .prepare(
        `SELECT t.id, t.user_id as userId, u.username, t.type, t.item, t.amount, t.status,
                ${normalizedTs("t.created_at")} as createdAt
         FROM transactions t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.currency = 'cash_usd'
         ORDER BY t.id DESC LIMIT 50`,
      )
      .all()

    res.json({
      totalRevenue,
      revenueByType,
      activeSubscriptions,
      activeByPlan,
      churnRate,
      canceledLast30d,
      failedPayments30d,
      recentTransactions,
    })
  }),
)

router.get(
  "/export.csv",
  asyncHandler(async (_req, res) => {
    const rows = db
      .prepare(
        `SELECT t.id, t.user_id as userId, u.username, t.type, t.item, t.counterparty,
                t.amount, t.status, ${normalizedTs("t.created_at")} as createdAt
         FROM transactions t
         LEFT JOIN users u ON u.id = t.user_id
         WHERE t.currency = 'cash_usd'
         ORDER BY t.id DESC`,
      )
      .all() as Record<string, unknown>[]

    const header = ["id", "userId", "username", "type", "item", "counterparty", "amount", "status", "createdAt"]
    const escapeCsv = (v: unknown) => {
      const s = v === null || v === undefined ? "" : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.join(",")]
    for (const row of rows) {
      lines.push(header.map((key) => escapeCsv(row[key])).join(","))
    }
    const csv = lines.join("\n")

    res.setHeader("Content-Type", "text/csv; charset=utf-8")
    res.setHeader("Content-Disposition", `attachment; filename="billing-transactions-${now_ymd()}.csv"`)
    res.send(csv)
  }),
)

function now_ymd(): string {
  return new Date().toISOString().slice(0, 10)
}

export default router
