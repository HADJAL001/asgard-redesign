import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

const router = Router()

/* Награда: 1 ∞ (TimeCoin) за каждые 5 приглашённых пользователей */
const REFERRALS_PER_REWARD = 5
const REWARD_TC = 1

/* ---------------- GET /referral/stats ---------------- */
router.get("/stats", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const user: any = db
    .prepare(`SELECT referral_code FROM users WHERE id = ?`)
    .get(userId)

  if (!user) return res.status(404).json({ error: "Пользователь не найден" })

  /* Общее количество приглашённых (по журналу referrals, kind='signup') */
  const { invites } = db
    .prepare(
      `SELECT COUNT(*) as invites FROM referrals WHERE referrer_id = ? AND kind = 'signup'`,
    )
    .get(userId) as { invites: number }

  /* Сколько уже выплачено наград (в ∞) */
  const { rewardedTC } = db
    .prepare(
      `SELECT COALESCE(SUM(amount_tc), 0) as rewardedTC FROM referrals WHERE referrer_id = ? AND kind = 'reward'`,
    )
    .get(userId) as { rewardedTC: number }

  /* Сколько раз уже забирали награду (по числу reward-записей) */
  const { rewardsClaimed } = db
    .prepare(
      `SELECT COUNT(*) as rewardsClaimed FROM referrals WHERE referrer_id = ? AND kind = 'reward'`,
    )
    .get(userId) as { rewardsClaimed: number }

  const totalRewardsAvailable = Math.floor(invites / REFERRALS_PER_REWARD)
  const claimable = Math.max(0, totalRewardsAvailable - rewardsClaimed)

  const invitesTowardNext = invites % REFERRALS_PER_REWARD
  const invitesNeededForNext = REFERRALS_PER_REWARD - invitesTowardNext

  res.json({
    referralCode: user.referral_code,
    invites,
    rewardsEarnedTC: rewardedTC,
    claimable, // сколько наград по 1 ∞ доступно к начислению прямо сейчас
    claimableTC: claimable * REWARD_TC,
    progress: {
      current: invitesTowardNext,
      target: REFERRALS_PER_REWARD,
      invitesNeededForNext: claimable > 0 ? 0 : invitesNeededForNext,
    },
  })
})

/* ---------------- POST /referral/claim ---------------- */
router.post("/claim", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const { invites } = db
    .prepare(
      `SELECT COUNT(*) as invites FROM referrals WHERE referrer_id = ? AND kind = 'signup'`,
    )
    .get(userId) as { invites: number }

  const { rewardsClaimed } = db
    .prepare(
      `SELECT COUNT(*) as rewardsClaimed FROM referrals WHERE referrer_id = ? AND kind = 'reward'`,
    )
    .get(userId) as { rewardsClaimed: number }

  const totalRewardsAvailable = Math.floor(invites / REFERRALS_PER_REWARD)
  const claimable = totalRewardsAvailable - rewardsClaimed

  if (claimable <= 0) {
    return res.status(400).json({
      error: `Недостаточно приглашённых для награды. Нужно ещё ${
        REFERRALS_PER_REWARD - (invites % REFERRALS_PER_REWARD)
      } приглашений.`,
    })
  }

  const rewardTC = claimable * REWARD_TC
  const now = Date.now()

  /* Начисляем TimeCoin в кошелёк */
  db.prepare(
    `UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`,
  ).run(rewardTC, now, userId)

  /* Записываем в журнал referrals по одной записи на каждую награду (для точного учёта rewardsClaimed) */
  const insertReward = db.prepare(
    `INSERT INTO referrals (referrer_id, referred_id, kind, amount_credits, amount_tc, created_at)
     VALUES (?, ?, 'reward', 0, ?, ?)`,
  )
  for (let i = 0; i < claimable; i++) {
    insertReward.run(userId, userId, REWARD_TC, now)
  }

  /* Отражаем в общей истории транзакций */
  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'referral_reward', ?, 'Реферальная программа', ?, 'timecoin', 'done')`,
  ).run(userId, `Награда за ${claimable * REFERRALS_PER_REWARD} приглашений`, rewardTC)

  const wallet: any = db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(userId)

  res.json({
    success: true,
    claimedTC: rewardTC,
    newBalanceTC: wallet?.timecoin ?? null,
  })
})

export default router
