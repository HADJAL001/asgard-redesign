import { Response } from "express"
import db from "../lib/db"
import { AuthRequest } from "../middleware/authMiddleware"
import { captureError } from "../lib/sentry"
import { recordAdminAction } from "../lib/admin-audit"
import { countStaleGuests, GUEST_REAP_TTL_MS } from "../lib/guest-service"
import { loadGenerationSamples, recommendTokenLimit } from "../lib/generation-estimate"
import { getGenerationUsageReport } from "../lib/generation-usage"

export class AdminController {
  // ===== GET /admin/analytics/generation-budget =====
  static async generationBudget(_req: AuthRequest, res: Response) {
    try {
      const samples = loadGenerationSamples()
      const profile = (depth: "quick" | "standard" | "deep", path: "template" | "ai") => {
        const rows = samples.filter((sample) => sample.depth === depth && sample.path === path)
        return { samples: rows.length, limit: recommendTokenLimit(rows) }
      }

      res.json({
        success: true,
        usage: getGenerationUsageReport(),
        methodology: {
          percentile: 0.95,
          headroom: 0.2,
          minimumSamples: 20,
          note: "Recommended per-generation limit is p95 of actual token usage plus 20%, rounded up to 10,000 tokens.",
        },
        recommendations: {
          quickTemplate: profile("quick", "template"),
          quickAi: profile("quick", "ai"),
          standardAi: profile("standard", "ai"),
          deepAi: profile("deep", "ai"),
          platform: { samples: samples.length, limit: recommendTokenLimit(samples) },
        },
      })
    } catch (error) {
      captureError("Admin generation budget error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

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
      recordAdminAction(req, "set_role", id, { role })
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
      recordAdminAction(req, "set_banned", id, { banned })
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

      recordAdminAction(req, "grant_tokens", id, { credits: creditsNum, timecoin: timecoinNum, reason })

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
          -- Бывает, что одна session_id кликает по нескольким разным тарифам подряд
          -- (передумал/сравнивает) — group by session_id с "голым" tier без агрегатной
          -- функции даёт SQLite право выбрать значение из произвольной строки группы.
          -- Явно берём тариф последнего по времени события в сессии через ROW_NUMBER().
          clicks_ranked AS (
            SELECT session_id, COALESCE(json_extract(meta, '$.plan'), 'unknown') as tier,
                   ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) as rn
            FROM window_events WHERE event_name = 'pricing_click'
          ),
          conversions_ranked AS (
            SELECT session_id, COALESCE(json_extract(meta, '$.plan'), 'unknown') as tier,
                   ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC) as rn
            FROM window_events WHERE event_name = 'pricing_conversion'
          ),
          clicks AS (SELECT session_id, tier FROM clicks_ranked WHERE rn = 1),
          conversions AS (SELECT session_id, tier FROM conversions_ranked WHERE rn = 1),
          click_counts AS (SELECT tier, COUNT(*) as clicks FROM clicks GROUP BY tier),
          conversion_counts AS (SELECT tier, COUNT(*) as conversions FROM conversions GROUP BY tier)
          -- notConverted = клики по тарифу минус оплаты по тому же тарифу — это НЕ то же
          -- самое, что overview.totalAbandons (реальное событие pricing_abandon, "ушёл
          -- без выбора тарифа"). Здесь считаются те, кто выбрал тариф, но не заплатил.
          SELECT
            c.tier as tier,
            c.clicks as clicks,
            COALESCE(v.conversions, 0) as conversions,
            MAX(c.clicks - COALESCE(v.conversions, 0), 0) as notConverted
          FROM click_counts c
          LEFT JOIN conversion_counts v ON v.tier = c.tier
          ORDER BY c.clicks DESC
        `,
        )
        .all(sinceMs) as { tier: string; clicks: number; conversions: number; notConverted: number }[]

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

  // ===== GET /admin/analytics/growth?days= =====
  // Дашборд серверной петли роста поверх событий, которые пишет lib/analytics.ts
  // (register/login/demo_convert/artifact_share_view, см. #46). Это НАДЁЖНЫЕ
  // серверные события: фиксируются в момент действия, их не теряет блокировщик/
  // оффлайн, в отличие от клиентского POST /analytics/event.
  //
  // Важно: analytics_events.created_at ВСЕГДА хранится как INTEGER unix ms (и
  // серверный track(), и клиентский приёмник пишут Date.now()), поэтому здесь
  // normalizedTs() не нужен — сравниваем и делим на 1000 напрямую.
  //
  // K-фактор виральности: теперь атрибуция «переход по share → регистрация» ЕСТЬ
  // (петля замкнута отдельной задачей): фронт при заходе по share-ссылке ставит
  // first-touch маркер 'share:<id>' и передаёт его в register → auth.controller
  // пишет его в meta.src события register (см. attributionSrc там). Клик по «share»
  // приходит клиентским artifact_share_click (whitelist в analytics.routes.ts).
  //
  // Честный K = viralRegistrations / distinctSharers — сколько НОВЫХ регистраций
  // приносит один уникальный «шарер» (сессия, кликнувшая share). Это НЕ учебниковый
  // K с рассылкой инвайтов, а его честный прокси на наших событиях; допущения явны:
  //   • distinctSharers — уникальные session_id с artifact_share_click (намерение);
  //   • viralRegistrations — register c meta.src LIKE 'share%' (доехал до регистрации).
  // Ноль шареров → K=0 (без деления на ноль). Отдаём и сырьё (clicks/sharers/viral),
  // чтобы цифру можно было перепроверить, а не верить агрегату на слово.
  static async growth(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000
      const EVENTS = "('register','login','demo_convert','artifact_share_view','artifact_share_click')"

      const totals = db
        .prepare(
          `
          SELECT
            COUNT(CASE WHEN event_name='register' THEN 1 END) as registrations,
            COUNT(CASE WHEN event_name='register' AND json_extract(meta,'$.referred') = 1 THEN 1 END) as referredRegistrations,
            COUNT(CASE WHEN event_name='login' THEN 1 END) as logins,
            COUNT(DISTINCT CASE WHEN event_name='login' THEN user_id END) as uniqueLoggedInUsers,
            COUNT(CASE WHEN event_name='demo_convert' THEN 1 END) as demoConversions,
            COUNT(CASE WHEN event_name='artifact_share_view' THEN 1 END) as shareViews,
            COUNT(DISTINCT CASE WHEN event_name='artifact_share_view' THEN json_extract(meta,'$.artifactId') END) as uniqueSharedArtifacts,
            COUNT(CASE WHEN event_name='artifact_share_click' THEN 1 END) as shareClicks,
            COUNT(DISTINCT CASE WHEN event_name='artifact_share_click' THEN session_id END) as distinctSharers,
            COUNT(CASE WHEN event_name='register' AND json_extract(meta,'$.src') LIKE 'share%' THEN 1 END) as viralRegistrations
          FROM analytics_events
          WHERE created_at >= ? AND event_name IN ${EVENTS}
        `,
        )
        .get(sinceMs) as {
        registrations: number
        referredRegistrations: number
        logins: number
        uniqueLoggedInUsers: number
        demoConversions: number
        shareViews: number
        uniqueSharedArtifacts: number
        shareClicks: number
        distinctSharers: number
        viralRegistrations: number
      }

      // Дневной ряд для графика (по UTC-дню события). DESC — свежее сверху.
      const daily = db
        .prepare(
          `
          SELECT
            date(created_at / 1000, 'unixepoch') as day,
            COUNT(CASE WHEN event_name='register' THEN 1 END) as registrations,
            COUNT(CASE WHEN event_name='login' THEN 1 END) as logins,
            COUNT(CASE WHEN event_name='demo_convert' THEN 1 END) as demoConversions,
            COUNT(CASE WHEN event_name='artifact_share_view' THEN 1 END) as shareViews,
            COUNT(CASE WHEN event_name='artifact_share_click' THEN 1 END) as shareClicks
          FROM analytics_events
          WHERE created_at >= ? AND event_name IN ${EVENTS}
          GROUP BY day
          ORDER BY day DESC
        `,
        )
        .all(sinceMs) as {
        day: string
        registrations: number
        logins: number
        demoConversions: number
        shareViews: number
        shareClicks: number
      }[]

      res.json({
        success: true,
        growth: {
          days,
          totals: {
            registrations: totals.registrations,
            referredRegistrations: totals.referredRegistrations,
            // доля регистраций, пришедших по реферальной ссылке
            referralRate: totals.registrations > 0 ? totals.referredRegistrations / totals.registrations : 0,
            logins: totals.logins,
            uniqueLoggedInUsers: totals.uniqueLoggedInUsers,
            demoConversions: totals.demoConversions,
            shareViews: totals.shareViews,
            uniqueSharedArtifacts: totals.uniqueSharedArtifacts,
            // ——— Виральная петля (замкнута: click → attribution → register) ———
            shareClicks: totals.shareClicks,
            distinctSharers: totals.distinctSharers,
            viralRegistrations: totals.viralRegistrations,
            // K-фактор: новых регистраций на одного уникального шарера. Явный прокси
            // на наших событиях (см. комментарий над методом), не учебниковый invite-K.
            kFactor: totals.distinctSharers > 0 ? totals.viralRegistrations / totals.distinctSharers : 0,
            // CTR публичной share-карточки: доля просмотров, дошедших до клика «поделиться».
            shareClickThroughRate: totals.shareViews > 0 ? totals.shareClicks / totals.shareViews : 0,
          },
          daily,
        },
      })
    } catch (error: any) {
      captureError("Admin growth error:", error)
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
        SELECT l.id, l.action, l.meta, l.created_at, l.ip, l.user_agent, l.status,
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
        ip: r.ip ?? null,
        userAgent: r.user_agent ?? null,
        status: r.status ?? null,
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

  // ===== GET /admin/analytics/integrity?days= =====
  /* Целостность экономики (#6): read-only детектор wash-trading для приложения с
     деньгами. Считает подозрительные паттерны поверх УЖЕ существующих таблиц маркета/
     аукционов/ордербука — ничего не мутирует, write-логику не трогает. Сигналы честные
     и раздельные (не смешиваем уровни): само-сделка и washTradingRate — на уровне ПРОДАЖ;
     реципрокные пары — на уровне ПАР юзеров; пинг-понг — на уровне АРТЕФАКТОВ. Плюс
     сырьё (топ-20) для ручной проверки аудитором. Окно — `days` (1..365, по умолч. 30). */
  static async integrity(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000

      // Проданные лоты маркета в окне — знаменатель для доль.
      const soldListings = (
        db.prepare(`SELECT COUNT(*) c FROM marketplace_listings WHERE status='sold' AND sold_at >= ?`).get(sinceMs) as {
          c: number
        }
      ).c

      // Само-сделка: продавец = покупатель. Легитимно невозможно → чистый сигнал накрутки.
      const selfDeals = (
        db
          .prepare(
            `SELECT COUNT(*) c FROM marketplace_listings
             WHERE status='sold' AND sold_at >= ? AND buyer_id IS NOT NULL AND buyer_id = seller_id`,
          )
          .get(sinceMs) as { c: number }
      ).c

      // Реципрокные пары (round-trip wash): неупорядоченная пара (lo,hi) продавала
      // артефакты В ОБЕ стороны (A→B и B→A) внутри окна — классическая круговая накрутка.
      const reciprocalPairs = db
        .prepare(
          `WITH sold AS (
             SELECT seller_id AS s, buyer_id AS b FROM marketplace_listings
             WHERE status='sold' AND sold_at >= ? AND buyer_id IS NOT NULL AND buyer_id <> seller_id
           )
           SELECT MIN(s, b) AS userA, MAX(s, b) AS userB, COUNT(*) AS trades
           FROM sold
           GROUP BY MIN(s, b), MAX(s, b)
           HAVING SUM(CASE WHEN s < b THEN 1 ELSE 0 END) > 0
              AND SUM(CASE WHEN s > b THEN 1 ELSE 0 END) > 0
           ORDER BY trades DESC
           LIMIT 20`,
        )
        .all(sinceMs) as { userA: number; userB: number; trades: number }[]

      // Пинг-понг: один и тот же артефакт перепродан ≥3× за окно (искусственный объём/цена).
      const pingPong = db
        .prepare(
          `SELECT artifact_id AS artifactId, COUNT(*) AS sales FROM marketplace_listings
           WHERE status='sold' AND sold_at >= ?
           GROUP BY artifact_id HAVING sales >= 3
           ORDER BY sales DESC LIMIT 20`,
        )
        .all(sinceMs) as { artifactId: number; sales: number }[]

      // Ордербук: само-кросс TC (одна сторона и купила, и продала) — фейковый объём торгов.
      const selfCrossTrades = (
        db
          .prepare(
            `SELECT COUNT(*) c FROM tc_trades
             WHERE ts >= ? AND buyer_id IS NOT NULL AND buyer_id = seller_id`,
          )
          .get(sinceMs) as { c: number }
      ).c

      // Аукцион: shill-ставка — продавец бидует собственный лот, разгоняя цену.
      const shillBids = (
        db
          .prepare(
            `SELECT COUNT(*) c FROM auction_bids b JOIN auctions a ON a.id = b.auction_id
             WHERE b.created_at >= ? AND b.bidder_id = a.seller_id`,
          )
          .get(sinceMs) as { c: number }
      ).c

      // Честная СДЕЛКО-уровневая доля: продажа помечена, если это само-сделка ИЛИ входит
      // в реципрокную пару ИЛИ её артефакт — пинг-понг. Единый запрос, без двойного счёта.
      const flaggedSales = (
        db
          .prepare(
            `WITH sold AS (
               SELECT artifact_id, seller_id, buyer_id FROM marketplace_listings
               WHERE status='sold' AND sold_at >= ?
             ),
             recip AS (
               SELECT MIN(seller_id, buyer_id) lo, MAX(seller_id, buyer_id) hi FROM sold
               WHERE buyer_id IS NOT NULL AND buyer_id <> seller_id
               GROUP BY MIN(seller_id, buyer_id), MAX(seller_id, buyer_id)
               HAVING SUM(CASE WHEN seller_id < buyer_id THEN 1 ELSE 0 END) > 0
                  AND SUM(CASE WHEN seller_id > buyer_id THEN 1 ELSE 0 END) > 0
             ),
             ping AS (
               SELECT artifact_id FROM sold GROUP BY artifact_id HAVING COUNT(*) >= 3
             )
             SELECT COUNT(*) c FROM sold s
             WHERE (s.buyer_id IS NOT NULL AND s.buyer_id = s.seller_id)
                OR EXISTS (SELECT 1 FROM recip r WHERE r.lo = MIN(s.seller_id, s.buyer_id) AND r.hi = MAX(s.seller_id, s.buyer_id))
                OR EXISTS (SELECT 1 FROM ping p WHERE p.artifact_id = s.artifact_id)`,
          )
          .get(sinceMs) as { c: number }
      ).c

      res.json({
        success: true,
        integrity: {
          days,
          totals: {
            soldListings,
            selfDeals,
            selfDealRate: soldListings > 0 ? selfDeals / soldListings : 0,
            reciprocalPairs: reciprocalPairs.length,
            pingPongArtifacts: pingPong.length,
            selfCrossTrades,
            shillBids,
            flaggedSales,
            // Доля продаж маркета с хотя бы одним wash-сигналом. Честный сделко-уровневый
            // показатель (см. запрос flaggedSales), а НЕ сумма разноуровневых счётчиков.
            washTradingRate: soldListings > 0 ? flaggedSales / soldListings : 0,
          },
          // Сырьё для ручной проверки аудитором (топ-20 по каждому вектору).
          suspects: {
            reciprocalPairs,
            pingPongArtifacts: pingPong,
          },
        },
      })
    } catch (error: any) {
      captureError("Admin integrity error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/analytics/security?days= =====
  /* Картина безопасности (read-only): постура защиты аккаунтов + аудит активности
     администраторов поверх admin_logs. Ничего не мутирует, миграций не требует —
     надстройка над моим доменом (auth/2FA/admin-audit). ВАЖНО про единицы времени
     (реальная боль этой БД, уже отражена в normalizedTs ниже):
       • users.created_at — на проде может лежать как TEXT (DATETIME CURRENT_TIMESTAMP),
         поэтому НОРМАЛИЗУЕМ через normalizedTs() к unix-мс перед сравнением;
       • users.last_login — пишется как unixepoch() = СЕКУНДЫ (user.model.ts), поэтому
         сравниваем с порогом в СЕКУНДАХ (sinceSec), а не в мс — иначе «активные» всегда 0;
       • admin_logs.created_at — Date.now() = мс (наша таблица аудита) → сравнение в мс. */
  static async security(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000
      const sinceSec = Math.floor(sinceMs / 1000)

      // ——— Постура аккаунтов (safeCount: отсутствие колонки → 0, а не 500) ———
      const totalUsers = safeCount(`SELECT COUNT(*) as c FROM users`)
      const twofaEnabled = safeCount(`SELECT COUNT(*) as c FROM users WHERE twofa_enabled = 1`)
      const bannedUsers = safeCount(`SELECT COUNT(*) as c FROM users WHERE banned = 1`)
      const admins = safeCount(`SELECT COUNT(*) as c FROM users WHERE role = 'admin'`)
      // created_at может быть TEXT на проде → normalizedTs к мс; порог в мс.
      const newUsers = safeCount(
        `SELECT COUNT(*) as c FROM users WHERE ${normalizedTs("created_at")} >= ${sinceMs}`,
      )
      // last_login — СЕКУНДЫ (unixepoch); порог в секундах. NULL = ни разу не входил.
      const activeUsers = safeCount(
        `SELECT COUNT(*) as c FROM users WHERE last_login IS NOT NULL AND last_login >= ${sinceSec}`,
      )

      // ——— Активность администраторов (admin_logs — наша таблица, created_at в мс) ———
      const adminRow = db
        .prepare(
          `
          SELECT
            COUNT(*) as actions,
            COUNT(DISTINCT admin_id) as distinctAdmins,
            COUNT(DISTINCT ip) as distinctIps,
            COUNT(CASE WHEN status >= 400 THEN 1 END) as failedActions,
            COUNT(CASE WHEN action NOT LIKE 'GET %' THEN 1 END) as mutatingActions
          FROM admin_logs
          WHERE created_at >= ?
        `,
        )
        .get(sinceMs) as {
        actions: number
        distinctAdmins: number
        distinctIps: number
        failedActions: number
        mutatingActions: number
      }

      // ——— Сырьё для аудитора (топ-20) ———
      const topAdminActions = db
        .prepare(
          `SELECT action, COUNT(*) as count FROM admin_logs
           WHERE created_at >= ? GROUP BY action ORDER BY count DESC, action ASC LIMIT 20`,
        )
        .all(sinceMs) as { action: string; count: number }[]

      const topAdminIps = db
        .prepare(
          `SELECT ip, COUNT(*) as count FROM admin_logs
           WHERE created_at >= ? AND ip IS NOT NULL GROUP BY ip ORDER BY count DESC, ip ASC LIMIT 20`,
        )
        .all(sinceMs) as { ip: string; count: number }[]

      res.json({
        success: true,
        security: {
          days,
          accounts: {
            totalUsers,
            twofaEnabled,
            // Доля аккаунтов с включённой 2FA — ключевая метрика постуры защиты.
            twofaAdoptionRate: totalUsers > 0 ? twofaEnabled / totalUsers : 0,
            bannedUsers,
            admins,
            newUsers,
            activeUsers,
          },
          adminActivity: {
            actions: adminRow.actions,
            distinctAdmins: adminRow.distinctAdmins,
            distinctIps: adminRow.distinctIps,
            // Неуспешные админ-запросы (HTTP ≥ 400): всплеск = зонд прав/битый доступ.
            failedActions: adminRow.failedActions,
            // Немутирующие GET исключены — считаем реальные действия над системой.
            mutatingActions: adminRow.mutatingActions,
          },
          suspects: {
            topAdminActions,
            topAdminIps,
          },
        },
      })
    } catch (error: any) {
      captureError("Admin security error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // ===== GET /admin/analytics/guest-funnel?days= =====
  // Верхняя часть конверсионной воронки «1 бесплатный проект по IP» (миграция 087):
  // гость провижинится → создаёт первый проект (активация бесплатной единицы) →
  // регистрируется и «забирает» гостя (claim, claimed_at). Меряем каждую ступень
  // и переходы между ними за окно `days` по когорте гостей (users.is_guest=1,
  // created_at в окне). Все счётчики через safeCount — отсутствие guest-колонок
  // (старый прод до 087) даёт 0, а не 500. Дополняет существующий registered→
  // activated→paid funnel, не пересекаясь с ним. Read-only, ничего не мутирует.
  static async guestFunnel(req: AuthRequest, res: Response) {
    try {
      const days = Math.min(365, Math.max(1, parseInt(String(req.query.days ?? "30"), 10) || 30))
      const sinceMs = Date.now() - days * 86400000

      // Когорта гостей окна. created_at гостя пишется как unix ms, но для
      // унификации с остальными ридерами приводим через normalizedTs.
      const cohortWhere = `is_guest = 1 AND ${normalizedTs("created_at")} >= ${sinceMs}`

      const created = safeCount(`SELECT COUNT(*) as c FROM users WHERE ${cohortWhere}`)
      // Активация: у гостя есть ≥1 проект (первый бесплатный сгенерирован).
      const withProject = safeCount(
        `SELECT COUNT(*) as c FROM users u WHERE ${cohortWhere}
           AND EXISTS (SELECT 1 FROM projects p WHERE p.user_id = u.id)`,
      )
      // Конверсия: гость «забран» реальным аккаунтом (claimed_at проставлен).
      const claimed = safeCount(
        `SELECT COUNT(*) as c FROM users WHERE ${cohortWhere} AND claimed_at IS NOT NULL`,
      )
      // Забраны И имели проект — «здоровая» конверсия (перенесена реальная работа).
      const claimedWithProject = safeCount(
        `SELECT COUNT(*) as c FROM users u WHERE ${cohortWhere} AND claimed_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM projects p WHERE p.user_id = u.id)`,
      )

      res.json({
        success: true,
        guestFunnel: {
          days,
          created, // провижинено гостей
          withProject, // из них создали первый проект
          claimed, // из них зарегистрировались (claim)
          claimedWithProject, // забраны, имея проект (ценная конверсия)
          // Ступенчатые переходы (0..1), знаменатель = предыдущая ступень.
          activationRate: created > 0 ? withProject / created : 0, // created→project
          claimRate: created > 0 ? claimed / created : 0, // created→claim
          projectToClaimRate: withProject > 0 ? claimedWithProject / withProject : 0, // project→claim
        },
      })
    } catch (error: any) {
      captureError("Admin guest-funnel error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }

  // Гигиена воронки (read-only): сколько брошенных гостей (is_guest=1 без проекта и
  // без регистрации, старше TTL) подлежит жатве прямо сейчас. Реальную чистку делает
  // планировщик lib/guest-reaper.ts; этот ридер лишь показывает объём мусора. TTL
  // настраивается через ?ttlDays= (клампится [1,365]), по умолчанию — GUEST_REAP_TTL_MS.
  static async guestHygiene(req: AuthRequest, res: Response) {
    try {
      const defaultTtlDays = Math.round(GUEST_REAP_TTL_MS / 86400000)
      const ttlDays = Math.min(
        365,
        Math.max(1, parseInt(String(req.query.ttlDays ?? defaultTtlDays), 10) || defaultTtlDays),
      )
      const staleGuests = countStaleGuests(Date.now(), ttlDays * 86400000)
      res.json({ success: true, guestHygiene: { ttlDays, staleGuests } })
    } catch (error: any) {
      captureError("Admin guest-hygiene error:", error)
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
