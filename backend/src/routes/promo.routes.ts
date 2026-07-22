import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { logAudit } from "../lib/audit"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · Промокоды
   ----------------------------------------------------------------
   POST /promo/redeem   — применить промокод (авторизованный юзер)
   POST /promo/create   — создать промокод (только admin)
   GET  /promo/list     — список промокодов (только admin)
   ================================================================ */

const router = Router()

type PromoRow = {
  id: number
  code: string
  type: "timecoin" | "trial_days" | "discount_pct"
  amount: number
  plan: string | null
  max_uses: number
  uses: number
  expires_at: number | null
}

/* ================================================================
   POST /promo/redeem
   Применяет промокод для текущего пользователя.

   body: { code: string }

   Логика по типу промокода:
   - timecoin     → зачисляет amount TC на кошелёк
   - trial_days   → активирует/продлевает план на amount дней
                    (требует поле plan в промокоде)
   - discount_pct → пока только фиксирует в redemptions (future use)
   ================================================================ */
router.post(
  "/redeem",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const code = (req.body?.code || "").trim().toUpperCase()

    if (!code) {
      return res.status(400).json({ error: "Укажите промокод" })
    }

    /* Ищем промокод (COLLATE NOCASE гарантирует регистронезависимость) */
    const promo = db
      .prepare(`SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE`)
      .get(code) as PromoRow | undefined

    if (!promo) {
      return res.status(404).json({ error: "Промокод не найден или уже не действует" })
    }

    /* Срок действия */
    if (promo.expires_at && promo.expires_at < Date.now()) {
      return res.status(410).json({ error: "Срок действия промокода истёк" })
    }

    /* Лимит использований */
    if (promo.uses >= promo.max_uses) {
      return res.status(409).json({ error: "Промокод уже исчерпан" })
    }

    /* Проверяем, не использовал ли этот юзер уже данный промокод */
    const alreadyUsed = db
      .prepare(`SELECT id FROM promo_redemptions WHERE promo_id = ? AND user_id = ?`)
      .get(promo.id, userId)

    if (alreadyUsed) {
      return res.status(409).json({ error: "Вы уже использовали этот промокод" })
    }

    /* ── Применяем бонус в транзакции ── */
    const now = Date.now()
    let bonusDescription = ""

    db.exec("BEGIN IMMEDIATE")
    try {
      /* Фиксируем использование промокода */
      db.prepare(
        `INSERT INTO promo_redemptions (promo_id, user_id, redeemed_at) VALUES (?, ?, ?)`,
      ).run(promo.id, userId, now)

      db.prepare(
        `UPDATE promo_codes SET uses = uses + 1, updated_at = ? WHERE id = ?`,
      ).run(now, promo.id)

      /* Начисляем бонус */
      switch (promo.type) {
        case "timecoin": {
          /* Гарантируем наличие кошелька */
          db.prepare(
            `INSERT INTO wallets (user_id, timecoin, created_at, updated_at)
             VALUES (?, 0, ?, ?)
             ON CONFLICT(user_id) DO NOTHING`,
          ).run(userId, now, now)

          db.prepare(
            `UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`,
          ).run(promo.amount, now, userId)

          db.prepare(
            `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
             VALUES (?, 'bonus', ?, 'OSGARD Promo', ?, 'timecoin', 'done')`,
          ).run(userId, `Промокод ${promo.code}`, promo.amount)

          logAudit(userId, "credit", promo.amount, "promo_timecoin", { code: promo.code })
          bonusDescription = `+${promo.amount} TimeCoin зачислено на кошелёк`
          break
        }

        case "trial_days": {
          /* Активируем/продлеваем план */
          const plan = promo.plan ?? "architect"
          const existingSub: any = db
            .prepare(`SELECT * FROM subscriptions WHERE user_id = ?`)
            .get(userId)

          const periodStart = now
          const periodEnd =
            existingSub?.current_period_end && existingSub.current_period_end > now
              ? existingSub.current_period_end + promo.amount * 24 * 60 * 60 * 1000
              : now + promo.amount * 24 * 60 * 60 * 1000

          if (!existingSub) {
            db.prepare(
              `INSERT INTO subscriptions
                (user_id, plan, status, current_period_start, current_period_end,
                 cancel_at_period_end, trial_used, created_at, updated_at)
               VALUES (?, ?, 'trialing', ?, ?, 0, 1, ?, ?)`,
            ).run(userId, plan, periodStart, periodEnd, now, now)
          } else {
            db.prepare(
              `UPDATE subscriptions SET
                 plan = ?, status = 'trialing',
                 current_period_start = ?, current_period_end = ?,
                 trial_used = 1, updated_at = ?
               WHERE user_id = ?`,
            ).run(plan, periodStart, periodEnd, now, userId)
          }

          db.prepare(`UPDATE users SET plan = ? WHERE id = ?`).run(plan, userId)

          db.prepare(
            `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
             VALUES (?, 'subscription', ?, 'OSGARD Promo', 0, 'cash_usd', 'done')`,
          ).run(userId, `Промокод ${promo.code}: ${promo.amount} дней ${plan}`)

          logAudit(userId, "credit", 0, "promo_trial_days", { code: promo.code, plan, days: promo.amount })
          bonusDescription = `Доступ к плану «${plan}» продлён на ${promo.amount} дней`
          break
        }

        case "discount_pct": {
          /* Пока только фиксируем — скидка будет применяться при checkout */
          logAudit(userId, "credit", 0, "promo_discount_pct", { code: promo.code, pct: promo.amount })
          bonusDescription = `Скидка ${promo.amount}% будет применена при следующей оплате`
          break
        }
      }

      db.exec("COMMIT")
    } catch (err) {
      db.exec("ROLLBACK")
      captureError("[promo/redeem] transaction error:", err)
      throw err
    }

    /* Возвращаем актуальные данные кошелька если это timecoin */
    let wallet: any = null
    if (promo.type === "timecoin") {
      wallet = db.prepare(`SELECT timecoin FROM wallets WHERE user_id = ?`).get(userId)
    }

    res.json({
      success: true,
      type: promo.type,
      amount: promo.amount,
      description: bonusDescription,
      ...(wallet ? { newBalance: wallet.timecoin } : {}),
    })
  }),
)

/* ================================================================
   POST /promo/create  (admin only)
   Создаёт новый промокод.

   body: {
     code:      string            — уникальный код (авто-uppercase)
     type:      "timecoin" | "trial_days" | "discount_pct"
     amount:    number            — величина бонуса
     plan?:     string            — только для trial_days
     max_uses?: number            — по умолчанию 1
     expires_at?: number          — timestamp ms, optional
   }
   ================================================================ */
router.post(
  "/create",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    /* Проверка прав администратора */
    const requester: any = db
      .prepare(`SELECT is_admin FROM users WHERE id = ?`)
      .get(req.user!.userId)

    if (!requester?.is_admin) {
      return res.status(403).json({ error: "Только администраторы могут создавать промокоды" })
    }

    const { code, type, amount, plan, max_uses, expires_at } = req.body || {}

    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "Укажите код промокода" })
    }
    if (!["timecoin", "trial_days", "discount_pct"].includes(type)) {
      return res.status(400).json({ error: "Тип промокода: timecoin | trial_days | discount_pct" })
    }
    if (typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ error: "amount должен быть положительным числом" })
    }
    if (type === "trial_days" && !plan) {
      return res.status(400).json({ error: "Для type=trial_days укажите plan" })
    }

    const now = Date.now()
    try {
      const result = db
        .prepare(
          `INSERT INTO promo_codes (code, type, amount, plan, max_uses, uses, expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        )
        .run(
          code.trim().toUpperCase(),
          type,
          amount,
          plan ?? null,
          max_uses ?? 1,
          expires_at ?? null,
          req.user!.userId,
          now,
          now,
        )

      const created = db
        .prepare(`SELECT * FROM promo_codes WHERE id = ?`)
        .get(result.lastInsertRowid)

      res.status(201).json({ promo: created })
    } catch (err: any) {
      if (err.message?.includes("UNIQUE")) {
        return res.status(409).json({ error: `Промокод «${code.toUpperCase()}» уже существует` })
      }
      throw err
    }
  }),
)

/* ================================================================
   GET /promo/list  (admin only)
   Возвращает список всех промокодов с количеством использований.
   ================================================================ */
router.get(
  "/list",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const requester: any = db
      .prepare(`SELECT is_admin FROM users WHERE id = ?`)
      .get(req.user!.userId)

    if (!requester?.is_admin) {
      return res.status(403).json({ error: "Только администраторы могут просматривать промокоды" })
    }

    const promos = db
      .prepare(`SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 200`)
      .all()

    res.json({ promos })
  }),
)

export default router
