import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { logAudit } from "../lib/audit"
import { runEconomyOp, EconomyError, normalizeIdemKey } from "../lib/economy-tx"

const router = Router()

const TOTAL_STEPS = 8

/* Награды за каждый шаг онбординга (тур по ключевым фичам платформы) */
const ONBOARDING_REWARDS: Record<
  number,
  { credits?: number; crystals?: number; badge?: string }
> = {
  1: { credits: 15 }, // Знакомство — переход на главную
  2: { credits: 20 }, // Мастер кузницы — демо-генерация в Forge
  3: { credits: 15 }, // Экономика — открыт Кошелёк, лестница валют
  4: { credits: 20 }, // Исследователь — открыта Комната ВАЛЛИ
  5: { credits: 18 }, // Голос — пост/комментарий в сообществе
  6: { credits: 18 }, // Личность — профиль
  7: { credits: 15 }, // Властелин — админ-панель
  8: { crystals: 25, badge: "pervoprohodets" }, // Первопроходец — финал онбординга, «Посвящение»
}

/* ---------------- GET /onboarding/status ---------------- */
router.get("/status", requireAuth, (req: AuthRequest, res) => {
  const user: any = db
    .prepare(`SELECT onboarding_step FROM users WHERE id = ?`)
    .get(req.user!.userId)

  if (!user) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

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

  if (!user) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

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
  logAudit(req.user!.userId, "credit", reward.credits || reward.crystals || 0, "onboarding_reward", { step: stepNum, badge: reward.badge })

  const completed = stepNum >= TOTAL_STEPS

  res.json({
    success: true,
    currentStep: stepNum,
    completed,
    reward,
  })
})

/* ---------------- Награда за обучающую презентацию «Карта экономики» ---------------- */
const ECONOMY_MAP_REWARD_CREDITS = 40

/* GET — узнать, получена ли награда (для состояния кнопки на фронте). */
router.get("/economy-map-reward", requireAuth, (req: AuthRequest, res) => {
  const u: any = db.prepare(`SELECT economy_map_reward_claimed FROM users WHERE id = ?`).get(req.user!.userId)
  if (!u) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })
  res.json({ claimed: !!u.economy_map_reward_claimed, credits: ECONOMY_MAP_REWARD_CREDITS })
})

/* POST — забрать одноразовую награду за прохождение обучения. */
router.post("/economy-map-reward", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const idemKey = normalizeIdemKey(req.header("Idempotency-Key") ?? (req.body as any)?.idempotencyKey)

  const u: any = db.prepare(`SELECT economy_map_reward_claimed FROM users WHERE id = ?`).get(userId)
  if (!u) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })
  /* Дешёвая предпроверка (быстрый 400 без транзакции). Авторитетная защита от
     двойного получения — условный UPDATE флага внутри mutate. */
  if (u.economy_map_reward_claimed) {
    return res.status(400).json({ error: "Награда за обучение уже получена", code: "ALREADY_CLAIMED" })
  }

  try {
    const opResult = runEconomyOp({
      userId,
      scope: "onboarding_economy_reward",
      idemKey,
      mutate: () => {
        /* Авторитетный «захват» награды: перевод флага 0→1 условным UPDATE.
           Прежде флаг читался и проверялся ВНЕ транзакции, а начисление шло
           тремя отдельными записями → двойной клик/гонка = двойная награда и
           частичное состояние. changes!==1 → уже получено (кто-то опередил). */
        const claim = db
          .prepare(`UPDATE users SET economy_map_reward_claimed = 1 WHERE id = ? AND economy_map_reward_claimed = 0`)
          .run(userId)
        if (claim.changes !== 1) {
          throw new EconomyError("Награда за обучение уже получена", 400, { code: "ALREADY_CLAIMED" })
        }
        const now = Date.now()
        db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`).run(ECONOMY_MAP_REWARD_CREDITS, now, userId)
        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'onboarding_reward', 'Обучение: Карта экономики', 'Академия OSGARD', ?, 'credits', 'done')`,
        ).run(userId, ECONOMY_MAP_REWARD_CREDITS)
        return { ok: true, credits: ECONOMY_MAP_REWARD_CREDITS }
      },
    })

    if (!opResult.replayed) {
      logAudit(userId, "credit", ECONOMY_MAP_REWARD_CREDITS, "economy_map_reward", {})
    }
    return res.json(opResult.result)
  } catch (err) {
    if (err instanceof EconomyError) {
      const body: Record<string, unknown> = { error: err.message }
      if (err.payload && typeof err.payload === "object") Object.assign(body, err.payload)
      return res.status(err.status).json(body)
    }
    throw err
  }
})

export default router
