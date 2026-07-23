import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { canEmitUnbacked } from "../lib/emission-guard"

const router = Router()

const DAY_MS = 24 * 60 * 60 * 1000

/* APR зависит от срока стейка (чем дольше — тем выше ставка) */
function getApr(days: number): number {
  if (days >= 180) return 0.24
  if (days >= 90) return 0.18
  if (days >= 30) return 0.12
  if (days >= 7) return 0.06
  return 0.03
}

const MARKET_FEE = 0.02 // комиссия рынка при досрочном/обычном снятии, идёт в базу

/* ---------------- GET /stakes ---------------- */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const stakes = db
    .prepare(
      `SELECT id, amount_tc as amountTC, days, apr, market_fee as marketFee,
              start_ts as startTs, end_ts as endTs, status
       FROM stakes WHERE user_id = ? ORDER BY start_ts DESC`,
    )
    .all(req.user!.userId)

  res.json({ stakes })
})

/* ---------------- POST /stakes ---------------- */
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { amount, days } = req.body || {}
  const amountTc = Number(amount)
  const stakeDays = Number(days)

  if (!amountTc || amountTc <= 0) {
    return res.status(400).json({ error: "Некорректная сумма стейка" })
  }
  if (!stakeDays || stakeDays <= 0) {
    return res.status(400).json({ error: "Некорректный срок стейка (в днях)" })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (wallet.timecoin < amountTc) {
    return res.status(400).json({ error: "Недостаточно TimeCoin" })
  }

  const apr = getApr(stakeDays)
  const now = Date.now()
  const endTs = now + stakeDays * DAY_MS

  db.prepare(
    `UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ?`,
  ).run(amountTc, now, req.user!.userId)

  const info = db
    .prepare(
      `INSERT INTO stakes (user_id, amount_tc, days, apr, market_fee, start_ts, end_ts, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    )
    .run(req.user!.userId, amountTc, stakeDays, apr, MARKET_FEE, now, endTs)

  db.prepare(`UPDATE tc_market_state SET staked = staked + ? WHERE id = 1`).run(amountTc)

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'stake', 'TimeCoin Stake', 'Asgard Vault', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, amountTc)

  const stake = db
    .prepare(
      `SELECT id, amount_tc as amountTC, days, apr, market_fee as marketFee,
              start_ts as startTs, end_ts as endTs, status
       FROM stakes WHERE id = ?`,
    )
    .get(Number(info.lastInsertRowid))

  res.status(201).json({ stake })
})

/* ---------------- POST /stakes/:id/unstake ---------------- */
router.post("/:id/unstake", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const stake: any = db.prepare(`SELECT * FROM stakes WHERE id = ?`).get(id)

  if (!stake) return res.status(404).json({ error: "Стейк не найден" })
  if (stake.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому стейку" })
  }
  if (stake.status !== "active") {
    return res.status(400).json({ error: "Стейк уже снят" })
  }

  const now = Date.now()
  const isMatured = now >= stake.end_ts
  const elapsedMs = Math.min(now - stake.start_ts, stake.end_ts - stake.start_ts)
  const elapsedDays = elapsedMs / DAY_MS

  /* Награда пропорциональна прошедшему времени; при досрочном снятии — комиссия рынка */
  let reward = stake.amount_tc * stake.apr * (elapsedDays / 365)
  if (!isMatured) {
    reward = reward * (1 - stake.market_fee)
  }

  /* Проценты по стейку не обеспечены резервом (в отличие от самого тела
     стейка — оно уже принадлежало пользователю и просто возвращается).
     Если казна больше не покрывает весь ∞ 1:1, проценты не начисляем —
     тело стейка возвращается полностью в любом случае. */
  if (reward > 0 && !(await canEmitUnbacked(reward))) {
    reward = 0
  }

  const totalReturn = stake.amount_tc + reward

  db.prepare(`UPDATE stakes SET status = 'unstaked' WHERE id = ?`).run(id)
  db.prepare(`UPDATE tc_market_state SET staked = MAX(0, staked - ?) WHERE id = 1`).run(stake.amount_tc)

  db.prepare(
    `UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`,
  ).run(totalReturn, now, req.user!.userId)

  db.prepare(
    `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
     VALUES (?, 'unstake', 'TimeCoin Unstake', 'Asgard Vault', ?, 'timecoin', 'done')`,
  ).run(req.user!.userId, totalReturn)

  const updatedStake = db
    .prepare(
      `SELECT id, amount_tc as amountTC, days, apr, market_fee as marketFee,
              start_ts as startTs, end_ts as endTs, status
       FROM stakes WHERE id = ?`,
    )
    .get(id)

  res.json({
    stake: updatedStake,
    reward,
    totalReturn,
    matured: isMatured,
  })
})

export default router
