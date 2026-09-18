import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import db from "../lib/db"

const router = Router()
const QUESTS = [
  { key: "eco", title: "Создай приложение для экологичной привычки", reward: 25 },
  { key: "telegram", title: "Собери проект с Telegram-интеграцией", reward: 25 },
  { key: "showcase", title: "Опубликуй проект, которым можно поделиться", reward: 50 },
] as const

function periodKey() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
}

router.get("/today", requireAuth, (req: AuthRequest, res) => {
  const period = periodKey()
  const userId = req.user!.userId
  const rows = db.prepare(`SELECT quest_key as questKey, progress, completed_at as completedAt FROM creator_quests WHERE user_id = ? AND period_key = ?`).all(userId, period) as Array<{ questKey: string; progress: number; completedAt: number | null }>
  const byKey = new Map(rows.map((row) => [row.questKey, row]))
  res.json({ period, quests: QUESTS.map((quest) => ({ ...quest, progress: byKey.get(quest.key)?.progress ?? 0, completed: Boolean(byKey.get(quest.key)?.completedAt) })) })
})

router.post("/:key/complete", requireAuth, (req: AuthRequest, res) => {
  const quest = QUESTS.find((item) => item.key === req.params.key)
  if (!quest) return res.status(404).json({ error: "Quest not found" })
  const period = periodKey()
  const userId = req.user!.userId
  const projectId = Number(req.body?.projectId)
  if (!Number.isInteger(projectId) || projectId <= 0) return res.status(400).json({ error: "projectId is required" })
  const project = db.prepare(`SELECT id, status FROM projects WHERE id = ? AND user_id = ?`).get(projectId, userId) as { id: number; status: string } | undefined
  if (!project || project.status === "failed") return res.status(400).json({ error: "A ready project is required" })

  const complete = db.transaction(() => {
    const now = Date.now()
    const inserted = db.prepare(`INSERT OR IGNORE INTO creator_quests (user_id, quest_key, period_key, progress, completed_at) VALUES (?, ?, ?, 1, ?)`).run(userId, quest.key, period, now)
    if (inserted.changes === 0) {
      const updated = db.prepare(`UPDATE creator_quests SET progress = 1, completed_at = ? WHERE user_id = ? AND quest_key = ? AND period_key = ? AND completed_at IS NULL`).run(now, userId, quest.key, period)
      if (updated.changes === 0) return 0
    }
    db.prepare(`UPDATE wallets SET credits = credits + ? WHERE user_id = ?`).run(quest.reward, userId)
    return quest.reward
  })
  res.json({ completed: true, reward: complete() })
})

export default router
