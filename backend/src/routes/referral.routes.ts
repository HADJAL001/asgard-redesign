import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"

const router = Router()

/* Награда: 5 ∞ (TimeCoin) начисляются АВТОМАТИЧЕСКИ в момент регистрации
   приглашённого (см. auth.controller.ts, INSERT INTO referrals + UPDATE wallets).
   Отдельного шага "забрать" в реальности нет — эндпоинты ниже читают тот же
   журнал `referrals` (referrer_id, referee_id, reward_amount, status), который
   реально создаётся при регистрации, а не устаревшую схему (kind/amount_tc). */

/* ---------------- GET /referral/stats ---------------- */
router.get("/stats", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const user: any = db
    .prepare(`SELECT referral_code FROM users WHERE id = ?`)
    .get(userId)

  if (!user) return res.status(404).json({ error: "Пользователь не найден" })

  const { invites } = db
    .prepare(`SELECT COUNT(*) as invites FROM referrals WHERE referrer_id = ?`)
    .get(userId) as { invites: number }

  const { rewardedTC } = db
    .prepare(`SELECT COALESCE(SUM(reward_amount), 0) as rewardedTC FROM referrals WHERE referrer_id = ?`)
    .get(userId) as { rewardedTC: number }

  res.json({
    referralCode: user.referral_code,
    invites,
    rewardsEarnedTC: rewardedTC,
    /* Награда начисляется мгновенно при регистрации приглашённого — "к получению" всегда 0 */
    claimable: 0,
    claimableTC: 0,
    progress: 0,
  })
})

/* ---------------- POST /referral/claim ----------------
   Награды начисляются автоматически при регистрации приглашённого, отдельного
   шага "забрать" не существует. Эндпоинт оставлен для совместимости с фронтендом
   (кнопка задизейблена при claimableTC <= 0) и всегда отвечает, что забирать нечего. */
router.post("/claim", requireAuth, (_req: AuthRequest, res) => {
  res.status(400).json({
    error: "Награды начисляются автоматически при регистрации приглашённого пользователя",
  })
})

export default router
