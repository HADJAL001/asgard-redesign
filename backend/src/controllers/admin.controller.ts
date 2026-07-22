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
      // users.created_at / transactions.created_at хранятся как INTEGER (unix ms, см.
      // scripts/init-db.ts) — сравнение с datetime('now', ...) (TEXT) не сработает
      // из-за несовпадения типов SQLite, поэтому сравниваем с unix-ms порогом напрямую.
      const dayAgoMs = `(strftime('%s','now','-1 day') * 1000)`
      const totalUsers = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c
      const newUsers24h = safeCount(`SELECT COUNT(*) as c FROM users WHERE created_at >= ${dayAgoMs}`)
      const totalProjects = safeCount(`SELECT COUNT(*) as c FROM projects`)
      const totalArtifacts = safeCount(`SELECT COUNT(*) as c FROM artifacts`)
      const transactions24h = safeCount(`SELECT COUNT(*) as c FROM transactions WHERE created_at >= ${dayAgoMs}`)
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
