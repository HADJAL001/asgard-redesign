import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

const router = Router()

const TOTAL_STEPS = 5

/* Награды за каждый шаг онбординга */
const ONBOARDING_REWARDS: Record<
  number,
  { credits?: number; crystals?: number; badge?: string }
> = {
  1: { credits: 10 },
  2: { credits: 50 },
  3: { credits: 100, badge: "first_lot" },
  4: { crystals: 1 },
  5: { crystals: 5 },
}

/* ---------------- GET /onboarding/status ---------------- */
router.get("/status", requireAuth, (req: AuthRequest, res) => {
  const user: any = db
    .prepare(`SELECT onboarding_step FROM users WHERE id = ?`)
    .get(req.user!.userId)

  if (!user) return res.status(404).json({ error: "Пользователь не найден" })

  const currentStep = user.onboarding_step ?? 0
  const completed = currentStep >= TOTAL_STEPS

  res.json({ currentStep, completed })
})

/* ---------------- POST /onboarding/step ---------------- */
router.post("/step", requireAuth, (req: AuthRequest, res) => {
  const { step } = req.body || {}
  const stepNum = Number(step)

  if (!stepNum || stepNum < 1 || stepNum > TOTAL_STEPS) {
    return res.status(400).json({ error: "Некорректный шаг онбординга" })
  }

  const user: any = db
    .prepare(`SELECT onboarding_step FROM users WHERE id = ?`)
    .get(req.user!.userId)

  if (!user) return res.status(404).json({ error: "Пользователь не найден" })

  const currentStep = user.onboarding_step ?? 0

  if (stepNum <= currentStep) {
    return res.status(400).json({ error: "Этот шаг уже пройден" })
  }
  if (stepNum !== currentStep + 1) {
    return res.status(400).json({ error: "Шаги нужно проходить последовательно" })
  }

  const reward = ONBOARDING_REWARDS[stepNum]
  const now = Date.now()

  if (reward.credits) {
    db.prepare(
      `UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`,
    ).run(reward.credits, now, req.user!.userId)
  }

  if (reward.crystals) {
    db.prepare(
      `UPDATE wallets SET crystals = crystals + ?, updated_at = ? WHERE user_id = ?`,
    ).run(reward.crystals, now, req.user!.userId)
  }

  if (reward.badge) {
    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'badge', ?, 'Онбординг', 0, 'badge', 'done')`,
    ).run(req.user!.userId, reward.badge)
  }

  db.prepare(`UPDATE users SET onboarding_step = ? WHERE id = ?`).run(
    stepNum,
    req.user!.userId,
  )

  const rewardParts: string[] = []
  if (reward.credits) rewardParts.push(`${reward.credits} credits`)
  if (reward.crystals) rewardParts.push(`${reward.crystals} crystals`)
  if (reward.badge) rewardParts.push(`бейдж "${reward.badge}"`)

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'onboarding_reward', ?, 'Онбординг', ?, ?, 'done')`,
  ).run(
    req.user!.userId,
    `Шаг ${stepNum}: ${rewardParts.join(", ")}`,
    reward.credits || reward.crystals || 0,
    reward.credits ? "credits" : reward.crystals ? "crystals" : "badge",
  )

  const completed = stepNum >= TOTAL_STEPS

  res.json({
    success: true,
    currentStep: stepNum,
    completed,
    reward,
  })
})

export default router
