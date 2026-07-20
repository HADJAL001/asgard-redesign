import { Response } from "express"
import db from "../lib/db"
import { AuthRequest } from "../middleware/authMiddleware"

export class AdminController {
  // ===== GET /admin/stats =====
  static async stats(_req: AuthRequest, res: Response) {
    try {
      const totalUsers = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c
      const newUsers24h = safeCount(`SELECT COUNT(*) as c FROM users WHERE created_at >= datetime('now', '-1 day')`)
      const totalProjects = safeCount(`SELECT COUNT(*) as c FROM projects`)
      const totalArtifacts = safeCount(`SELECT COUNT(*) as c FROM artifacts`)
      const transactions24h = safeCount(`SELECT COUNT(*) as c FROM transactions WHERE created_at >= datetime('now', '-1 day')`)
      const walletTotals = db.prepare(`SELECT COALESCE(SUM(balance_credits),0) as credits, COALESCE(SUM(balance_tc),0) as tc FROM users`).get() as { credits: number; tc: number } | undefined

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
      console.error("Admin stats error:", error)
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
      console.error("Admin listUsers error:", error)
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

      const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id)
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" })
      }

      db.prepare(`UPDATE users SET role = ? WHERE id = ?`).run(role, id)
      res.json({ success: true })
    } catch (error: any) {
      console.error("Admin setRole error:", error)
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

      const user = db.prepare(`SELECT id FROM users WHERE id = ?`).get(id)
      if (!user) {
        return res.status(404).json({ error: "Пользователь не найден" })
      }

      db.prepare(`UPDATE users SET banned = ? WHERE id = ?`).run(banned ? 1 : 0, id)
      res.json({ success: true })
    } catch (error: any) {
      console.error("Admin setBanned error:", error)
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
