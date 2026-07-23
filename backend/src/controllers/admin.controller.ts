import { Response } from "express"
import db from "../lib/db"
import { AuthRequest } from "../middleware/authMiddleware"
import { captureError } from "../lib/sentry"

function logAdminAction(adminId: number, action: string, targetUserId: number | null, meta?: Record<string, any>) {
  try {
    db.prepare(
      `INSERT INTO admin_logs (admin_id, action, target_user_id, meta, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(adminId, action, targetUserId, meta ? JSON.stringify(meta) : null, Date.now())
  } catch (error) {
    captureError("Admin log write error:", error)
  }
}

export class AdminController {
  // ===== GET /admin/stats =====
  static async stats(_req: AuthRequest, res: Response) {
    try {
      // users.created_at / transactions.created_at на факте хранятся как TEXT
      // (DATETIME DEFAULT CURRENT_TIMESTAMP, см. фактический sqlite_master, а не
      // scripts/init-db.ts, который эту таблицу не создавал), а generation_metrics /
      // subscriptions — как INTEGER unix ms. Прямое сравнение created_at >= <INTEGER>
      // с TEXT-значением по правилам сортировки типов SQLite (INTEGER < TEXT) всегда
      // истинно — поэтому нормализуем через typeof() перед сравнением.
      const dayAgoMs = `(strftime('%s','now','-1 day') * 1000)`
      const totalUsers = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c
      const newUsers24h = safeCount(
        `SELECT COUNT(*) as c FROM users WHERE ${normalizedTs("created_at")} >= ${dayAgoMs}`,
      )
      const totalProjects = safeCount(`SELECT COUNT(*) as c FROM projects`)
      const totalArtifacts = safeCount(`SELECT COUNT(*) as c FROM artifacts`)
      const transactions24h = safeCount(
        `SELECT COUNT(*) as c FROM transactions WHERE ${normalizedTs("created_at")} >= ${dayAgoMs}`,
      )
      // Балансы живут в таблице wallets (см. auth.controller.ts::register), а не в users —
      // users.balance_* существовал только в устаревшей, ныне удалённой ручной миграции, но не в
      // legacy-схеме scripts/init-db.ts, которая создала реальную прод-таблицу.
      const walletTotals = safeAggregate(
        `SELECT COALESCE(SUM(credits),0) as credits, COALESCE(SUM(timecoin),0) as tc FROM wallets`,
      )

      res.json({
        success: true,
        stats: {
          totalUsers,
          newUsers24h,
          totalProjects,
          totalArtifacts,
          transactions24h,
          totalCreditsInCirculation: walletTotals?.credits ?? 0,
          totalTcInCirculation: walletTotals?.tc ?? 0,
        },
      })
    } catch (error: any) {
      captureError("Admin stats error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/users?search=&page=&limit= =====
  static async listUsers(req: AuthRequest, res: Response) {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : ""
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1)
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "20"), 10) || 20))
      const offset = (page - 1) * limit

      let rows: any[]
      let total: number

      if (search) {
        const like = `%${search}%`
        rows = db.prepare(`
          SELECT id, username, email, role, banned, created_at
          FROM users
          WHERE username LIKE ? OR email LIKE ?
          ORDER BY id DESC
          LIMIT ? OFFSET ?
        `).all(like, like, limit, offset)
        total = (db.prepare(`
          SELECT COUNT(*) as c FROM users WHERE username LIKE ? OR email LIKE ?
        `).get(like, like) as { c: number }).c
      } else {
        rows = db.prepare(`
          SELECT id, username, email, role, banned, created_at
          FROM users
          ORDER BY id DESC
          LIMIT ? OFFSET ?
        `).all(limit, offset)
        total = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c
      }

      res.json({
        success: true,
        users: rows,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      })
    } catch (error: any) {
      captureError("Admin listUsers error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== PATCH /admin/users/:id/role =====
  static async setRole(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10)
      const { role } = req.body || {}

      if (!id || !["admin", "user"].includes(role)) {
        return res.status(400).json({ error: "Некорректные данные" })
      }

      if (id === req.user!.userId) {
        return res.status(400).json({ error: "Нельзя изменить собственную роль" })
      }

      const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id)
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" })
      }

      db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id)
      logAdminAction(req.user!.userId, "set_role", id, { role })
      res.json({ success: true })
    } catch (error: any) {
      captureError("Admin setRole error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== PATCH /admin/users/:id/ban =====
  static async setBanned(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10)
      const { banned } = req.body || {}

      if (!id || typeof banned !== "boolean") {
        return res.status(400).json({ error: "Некорректные данные" })
      }

      if (id === req.user!.userId) {
        return res.status(400).json({ error: "Нельзя заблокировать самого себя" })
      }

      const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id)
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" })
      }

      db.prepare(`UPDATE users SET banned = ? WHERE id = ?`).run(banned ? 1 : 0, id)
      logAdminAction(req.user!.userId, "set_banned", id, { banned })
      res.json({ success: true })
    } catch (error: any) {
      captureError("Admin setBanned error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== PATCH /admin/users/:id/grant =====
  static async grantTokens(req: AuthRequest, res: Response) {
    try {
      const id = parseInt(req.params.id, 10)
      const { credits, timecoin, reason } = req.body || {}

      const creditsNum = credits === undefined || credits === null ? 0 : Number(credits)
      const timecoinNum = timecoin === undefined || timecoin === null ? 0 : Number(timecoin)

      if (!id || !Number.isFinite(creditsNum) || !Number.isFinite(timecoinNum) || (creditsNum === 0 && timecoinNum === 0)) {
        return res.status(400).json({ error: "Некорректные данные" })
      }

      const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id)
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" })
      }

      const wallet = db.prepare(`SELECT user_id FROM wallets WHERE user_id = ?`).get(id)
      if (!wallet) {
        return res.status(404).json({ error: "Кошелёк пользователя не найден" })
      }

      db.prepare(
        `UPDATE wallets SET credits = MAX(0, credits + ?), timecoin = MAX(0, timecoin + ?), updated_at = ? WHERE user_id = ?`,
      ).run(creditsNum, timecoinNum, Date.now(), id)

      logAdminAction(req.user!.userId, "grant_tokens", id, { credits: creditsNum, timecoin: timecoinNum, reason })

      res.json({ success: true })
    } catch (error: any) {
      captureError("Admin grantTokens error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/analytics/funnel?days= =====
  static async funnel(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000

      const row = db
        .prepare(
          `
          WITH cohort AS (
            SELECT id FROM users WHERE ${normalizedTs("created_at")} >= ?
          ),
          activated AS (
            SELECT DISTINCT user_id FROM generation_metrics WHERE status = 'completed'
          ),
          paid AS (
            SELECT DISTINCT user_id FROM subscriptions WHERE plan != 'free' AND status = 'active'
          )
          SELECT
            (SELECT COUNT(*) FROM cohort) as registered,
            (SELECT COUNT(*) FROM cohort c JOIN activated a ON a.user_id = c.id) as activated,
            (SELECT COUNT(*) FROM cohort c JOIN paid p ON p.user_id = c.id) as paid
        `,
        )
        .get(sinceMs) as { registered: number; activated: number; paid: number }

      res.json({
        success: true,
        funnel: {
          days,
          registered: row.registered,
          activated: row.activated,
          paid: row.paid,
          activationRate: row.registered > 0 ? row.activated / row.registered : 0,
          paidConversionRate: row.registered > 0 ? row.paid / row.registered : 0,
        },
      })
    } catch (error: any) {
      captureError("Admin funnel error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/analytics/retention?days= =====
  // Когортная ретенция по дню регистрации: доля пользователей когорты, у
  // которых была активность (успешная генерация или транзакция) ровно на
  // D+1 / D+7 / D+30 после регистрации (классическое определение "N-day
  // retention", окно [regDay+N, regDay+N+1)).
  static async retention(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000
      const DAY_MS = 86400000

      const rows = db
        .prepare(
          `
          WITH activity AS (
            SELECT user_id, created_at FROM generation_metrics WHERE status = 'completed'
            UNION ALL
            SELECT user_id, ${normalizedTs("created_at")} as created_at FROM transactions
          ),
          cohorts AS (
            SELECT user_id, registered_at, date(registered_at / 1000, 'unixepoch') as cohort_day
            FROM (
              SELECT id as user_id, ${normalizedTs("created_at")} as registered_at FROM users
            )
            WHERE registered_at >= ?
          )
          SELECT
            c.cohort_day as cohortDay,
            COUNT(DISTINCT c.user_id) as cohortSize,
            COUNT(DISTINCT CASE WHEN a.created_at >= c.registered_at + ${DAY_MS}
                                  AND a.created_at < c.registered_at + 2 * ${DAY_MS}
                                 THEN a.user_id END) as d1,
            COUNT(DISTINCT CASE WHEN a.created_at >= c.registered_at + 7 * ${DAY_MS}
                                  AND a.created_at < c.registered_at + 8 * ${DAY_MS}
                                 THEN a.user_id END) as d7,
            COUNT(DISTINCT CASE WHEN a.created_at >= c.registered_at + 30 * ${DAY_MS}
                                  AND a.created_at < c.registered_at + 31 * ${DAY_MS}
                                 THEN a.user_id END) as d30
          FROM cohorts c
          LEFT JOIN activity a ON a.user_id = c.user_id
          GROUP BY c.cohort_day
          ORDER BY c.cohort_day DESC
        `,
        )
        .all(sinceMs) as { cohortDay: string; cohortSize: number; d1: number; d7: number; d30: number }[]

      res.json({ success: true, retention: rows })
    } catch (error: any) {
      captureError("Admin retention error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/analytics/paywall-funnel?days= =====
  // Строится поверх analytics_events (pricing_view/pricing_click/pricing_conversion/
  // pricing_abandon, см. routes/analytics.routes.ts и components/pricing-view.tsx).
  // Группировка "по сессии" (session_id), а не по событиям — иначе повторные клики/
  // просмотры одной сессии задваивали бы конверсию.
  static async paywallFunnel(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000

      const overview = db
        .prepare(
          `
          WITH window_events AS (
            SELECT * FROM analytics_events
            WHERE created_at >= ? AND event_name IN ('pricing_view','pricing_click','pricing_conversion','pricing_abandon')
          ),
          views AS (SELECT DISTINCT session_id FROM window_events WHERE event_name = 'pricing_view'),
          clicks AS (SELECT DISTINCT session_id FROM window_events WHERE event_name = 'pricing_click'),
          conversions AS (SELECT DISTINCT session_id FROM window_events WHERE event_name = 'pricing_conversion'),
          abandons AS (SELECT DISTINCT session_id FROM window_events WHERE event_name = 'pricing_abandon')
          SELECT
            (SELECT COUNT(*) FROM views) as totalViews,
            (SELECT COUNT(*) FROM clicks) as totalClicks,
            (SELECT COUNT(*) FROM conversions) as totalConversions,
            (SELECT COUNT(*) FROM abandons) as totalAbandons
        `,
        )
        .get(sinceMs) as { totalViews: number; totalClicks: number; totalConversions: number; totalAbandons: number }

      const byTier = db
        .prepare(
          `
          WITH window_events AS (
            SELECT * FROM analytics_events
            WHERE created_at >= ? AND event_name IN ('pricing_click','pricing_conversion')
          ),
          clicks AS (
            SELECT session_id, COALESCE(json_extract(meta, '$.plan'), 'unknown') as tier
            FROM window_events WHERE event_name = 'pricing_click'
            GROUP BY session_id
          ),
          conversions AS (
            SELECT session_id, COALESCE(json_extract(meta, '$.plan'), 'unknown') as tier
            FROM window_events WHERE event_name = 'pricing_conversion'
            GROUP BY session_id
          ),
          click_counts AS (SELECT tier, COUNT(*) as clicks FROM clicks GROUP BY tier),
          conversion_counts AS (SELECT tier, COUNT(*) as conversions FROM conversions GROUP BY tier)
          SELECT
            c.tier as tier,
            c.clicks as clicks,
            COALESCE(v.conversions, 0) as conversions,
            MAX(c.clicks - COALESCE(v.conversions, 0), 0) as abandoned
          FROM click_counts c
          LEFT JOIN conversion_counts v ON v.tier = c.tier
          ORDER BY c.clicks DESC
        `,
        )
        .all(sinceMs) as { tier: string; clicks: number; conversions: number; abandoned: number }[]

      const decisionTime = db
        .prepare(
          `
          WITH window_events AS (
            SELECT * FROM analytics_events
            WHERE created_at >= ? AND event_name IN ('pricing_view','pricing_click')
          ),
          first_view AS (SELECT session_id, MIN(created_at) as ts FROM window_events WHERE event_name = 'pricing_view' GROUP BY session_id),
          first_click AS (SELECT session_id, MIN(created_at) as ts FROM window_events WHERE event_name = 'pricing_click' GROUP BY session_id)
          SELECT AVG(fc.ts - fv.ts) as avgMs
          FROM first_click fc
          JOIN first_view fv ON fv.session_id = fc.session_id
          WHERE fc.ts >= fv.ts
        `,
        )
        .get(sinceMs) as { avgMs: number | null }

      const mostPopularTier = byTier.length > 0 ? byTier[0].tier : null

      res.json({
        success: true,
        funnel: {
          days,
          totalViews: overview.totalViews,
          totalClicks: overview.totalClicks,
          totalConversions: overview.totalConversions,
          totalAbandons: overview.totalAbandons,
          viewToClickRate: overview.totalViews > 0 ? overview.totalClicks / overview.totalViews : 0,
          clickToConversionRate: overview.totalClicks > 0 ? overview.totalConversions / overview.totalClicks : 0,
          overallConversionRate: overview.totalViews > 0 ? overview.totalConversions / overview.totalViews : 0,
          mostPopularTier,
          avgDecisionTimeSec: decisionTime.avgMs ? Math.round(decisionTime.avgMs / 1000) : 0,
          byTier,
        },
      })
    } catch (error: any) {
      captureError("Admin paywallFunnel error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/logs?page=&limit= =====
  static async listLogs(req: AuthRequest, res: Response) {
    try {
      const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1)
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50))
      const offset = (page - 1) * limit

      const rows = db.prepare(`
        SELECT l.id, l.action, l.meta, l.created_at,
               a.id as admin_id, a.username as admin_username,
               t.id as target_id, t.username as target_username
        FROM admin_logs l
        JOIN users a ON a.id = l.admin_id
        LEFT JOIN users t ON t.id = l.target_user_id
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `).all(limit, offset) as any[]

      const total = (db.prepare(`SELECT COUNT(*) as c FROM admin_logs`).get() as { c: number }).c

      const logs = rows.map((r) => ({
        id: r.id,
        action: r.action,
        meta: r.meta ? JSON.parse(r.meta) : null,
        createdAt: r.created_at,
        admin: { id: r.admin_id, username: r.admin_username },
        target: r.target_id ? { id: r.target_id, username: r.target_username } : null,
      }))

      res.json({
        success: true,
        logs,
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      })
    } catch (error: any) {
      captureError("Admin listLogs error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }
}

// users.created_at / transactions.created_at на факте хранятся как TEXT
// (DATETIME DEFAULT CURRENT_TIMESTAMP), а generation_metrics / subscriptions —
// как INTEGER unix ms. Приводит колонку к unix ms независимо от фактического
// типа хранения, чтобы сравнение с числовым порогом работало корректно.
function normalizedTs(col: string): string {
  return `(CASE WHEN typeof(${col}) = 'text' THEN CAST(strftime('%s', ${col}) AS INTEGER) * 1000 ELSE ${col} END)`
}

function safeCount(sql: string): number {
  try {
    return (db.prepare(sql).get() as { c: number } | undefined)?.c ?? 0
  } catch {
    return 0
  }
}

function safeAggregate(sql: string): { credits: number; tc: number } {
  try {
    return (db.prepare(sql).get() as { credits: number; tc: number } | undefined) ?? { credits: 0, tc: 0 }
  } catch {
    return { credits: 0, tc: 0 }
  }
}
