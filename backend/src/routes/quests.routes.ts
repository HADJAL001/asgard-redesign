import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import db from "../lib/db"

const router = Router()
const QUESTS = [
  { key: "eco", title: "Создай приложение для экологичной привычки", reward: 2 },
  { key: "telegram", title: "Собери проект с Telegram-интеграцией", reward: 2 },
  { key: "showcase", title: "Опубликуй проект, которым можно поделиться", reward: 5 },
] as const
const WEEKLY_QUESTS = [
  { key: "weekly-telegram", title: "Create and publish a project with a Telegram integration", generationBonus: 1 },
  { key: "weekly-showcase", title: "Create a project ready to share with a client", generationBonus: 1 },
] as const

function periodKey() {
  const now = new Date()
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`
}

function dailyQuest() {
  const now = new Date()
  const dayIndex = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86_400_000)
  return QUESTS[dayIndex % QUESTS.length]
}

function weekKey() {
  const now = new Date()
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() - day + 1)
  return `${utc.getUTCFullYear()}-W${String(Math.ceil((((utc.getTime() - Date.UTC(utc.getUTCFullYear(), 0, 1)) / 86_400_000) + 1) / 7)).padStart(2, "0")}`
}

function weeklyQuest() {
  const [year, week] = weekKey().match(/(\d+)-W(\d+)/)?.slice(1).map(Number) ?? [0, 0]
  return WEEKLY_QUESTS[(year + week) % WEEKLY_QUESTS.length]
}

function nextWeekMs() {
  const now = new Date()
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() - day + 8)
  return utc.getTime()
}

router.get("/today", requireAuth, (req: AuthRequest, res) => {
  const period = periodKey()
  const userId = req.user!.userId
  const rows = db.prepare(`SELECT quest_key as questKey, progress, completed_at as completedAt FROM creator_quests WHERE user_id = ? AND period_key = ?`).all(userId, period) as Array<{ questKey: string; progress: number; completedAt: number | null }>
  const byKey = new Map(rows.map((row) => [row.questKey, row]))
  const quest = dailyQuest()
  res.json({ period, quests: [{ ...quest, progress: byKey.get(quest.key)?.progress ?? 0, completed: Boolean(byKey.get(quest.key)?.completedAt) }] })
})

router.get("/active", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const dailyPeriod = periodKey()
  const weeklyPeriod = weekKey()
  const daily = dailyQuest()
  const weekly = weeklyQuest()
  const rows = db.prepare(`SELECT quest_key as questKey, period_key as periodKey, progress, completed_at as completedAt FROM creator_quests WHERE user_id = ? AND period_key IN (?, ?)`).all(userId, dailyPeriod, weeklyPeriod) as Array<{ questKey: string; periodKey: string; progress: number; completedAt: number | null }>
  const byQuest = new Map(rows.map((row) => [`${row.periodKey}:${row.questKey}`, row]))
  const state = (period: string, quest: { key: string }) => byQuest.get(`${period}:${quest.key}`)
  const dailyState = state(dailyPeriod, daily)
  const weeklyState = state(weeklyPeriod, weekly)
  res.json({
    daily: { ...daily, progress: dailyState?.progress ?? 0, completed: Boolean(dailyState?.completedAt) },
    weekly: { ...weekly, reward: { generationBonus: weekly.generationBonus }, progress: weeklyState?.progress ?? 0, completed: Boolean(weeklyState?.completedAt) },
  })
})

router.post("/:key/complete", requireAuth, (req: AuthRequest, res) => {
  const daily = dailyQuest()
  const weekly = weeklyQuest()
  const isWeekly = req.params.key === weekly.key
  const quest = isWeekly ? weekly : daily
  if (req.params.key !== quest.key) return res.status(404).json({ error: "Quest is not active" })
  const period = isWeekly ? weekKey() : periodKey()
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
    if (isWeekly) {
      const expiresAt = nextWeekMs()
      const bonusKey = `creator:${period}:${userId}`
      db.prepare(`INSERT OR IGNORE INTO weekly_generation_bonuses (week_key, user_id, bonus_generations, expires_at) VALUES (?, ?, ?, ?)`).run(bonusKey, userId, weekly.generationBonus, expiresAt)
      return { generationBonus: weekly.generationBonus, expiresAt }
    }
    db.prepare(`UPDATE wallets SET credits = credits + ? WHERE user_id = ?`).run(daily.reward, userId)
    return { credits: daily.reward }
  })
  res.json({ completed: true, reward: complete() })
})

export default router
