import { Router, Response } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { asyncHandler } from "../utils/async-handler"
import { rateLimit } from "../middleware/rateLimiter"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"
import { FRONTEND_URL, PlanKey } from "../lib/stripe"
import { upsertSubscription } from "./subscription.routes"
import {
  isYookassaConfigured,
  createYookassaPayment,
  getYookassaPayment,
  PLAN_PRICES_RUB,
} from "../lib/yookassa"

/* ================================================================
   OSGARD · ЮKassa Routes — оплата подписки из России
   ----------------------------------------------------------------
   POST /yookassa/create-payment {plan}  → {url} (confirmation_url ЮKassa)
   POST /yookassa/webhook                → уведомление ЮKassa

   Разовый платёж активирует план на 30 дней (как mock-режим Stripe).
   Рекуррентное автопродление здесь НЕ делается — по истечении месяца
   пользователь оплачивает снова (для РФ это самый простой честный
   вариант; авто-списание ЮKassa — отдельный тикет).

   Webhook ЮKassa НЕ подписан HMAC → доверяем не телу, а перезапросу
   платежа по id (getYookassaPayment). Идемпотентность — через таблицу
   yookassa_payments (миграция 068).
   ================================================================ */

const router = Router()

const PAID_PLANS: Exclude<PlanKey, "free">[] = ["pro", "supreme", "duo", "elite"]
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000 // 30 дней

/* ---------------- POST /yookassa/create-payment ---------------- */
router.post(
  "/create-payment",
  rateLimit(60_000, 10),
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { plan, email } = req.body || {}

    if (!PAID_PLANS.includes(plan)) {
      return res.status(400).json({
        error: `Некорректный план. Допустимые: ${PAID_PLANS.join(", ")}`,
      })
    }

    if (!isYookassaConfigured) {
      return res.status(503).json({
        error: "Оплата через ЮKassa временно недоступна (провайдер не настроен).",
      })
    }

    const userId = req.user!.userId
    const amountRub = PLAN_PRICES_RUB[plan as Exclude<PlanKey, "free">]

    /* Email нужен для чека 54-ФЗ (см. createYookassaPayment). Приоритет — email
       из профиля; если его нет, принимаем переданный клиентом (форма перед
       оплатой) с валидацией формата. Если нет ни того, ни другого — платёж
       создастся без чека (сработает только для магазинов без онлайн-кассы). */
    const userRow = db.prepare(`SELECT email FROM users WHERE id = ?`).get(userId) as
      | { email: string | null }
      | undefined

    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    let receiptEmail = userRow?.email || undefined
    if (!receiptEmail && typeof email === "string" && email.trim()) {
      const candidate = email.trim()
      if (!EMAIL_RE.test(candidate) || candidate.length > 254) {
        return res.status(400).json({ error: "Некорректный email для чека", code: "INVALID_EMAIL" })
      }
      receiptEmail = candidate
    }

    try {
      const payment = await createYookassaPayment({
        amountRub,
        description: `OSGARD — подписка «${plan}» на 30 дней`,
        returnUrl: `${FRONTEND_URL}/wallet?checkout=success&plan=${plan}&provider=yookassa`,
        metadata: { userId: String(userId), plan },
        receiptEmail,
      })

      const confirmationUrl = payment.confirmation?.confirmation_url
      if (!confirmationUrl) {
        return res.status(502).json({ error: "ЮKassa не вернула ссылку на оплату" })
      }

      const now = Date.now()
      db.prepare(
        `INSERT INTO yookassa_payments (id, user_id, plan, amount_rub, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
      ).run(payment.id, userId, plan, amountRub, payment.status, now, now)

      res.status(200).json({ url: confirmationUrl, paymentId: payment.id })
    } catch (err: any) {
      captureError("[yookassa/create-payment] error:", err)
      res.status(500).json({ error: err.message || "Не удалось создать платёж ЮKassa" })
    }
  }),
)

/* ---------------- POST /yookassa/webhook ----------------
   ЮKassa шлёт JSON без подписи. Берём id из уведомления, но статус
   проверяем перезапросом платежа через API (не доверяем телу). */
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const event = req.body?.event as string | undefined
    const paymentId = req.body?.object?.id as string | undefined

    if (!paymentId) {
      return res.status(400).json({ error: "Нет object.id в уведомлении" })
    }

    if (!isYookassaConfigured) {
      return res.status(503).json({ error: "ЮKassa не настроена" })
    }

    /* Отвечаем 200 сразу на неинтересные события, чтобы ЮKassa не ретраила. */
    if (event && event !== "payment.succeeded") {
      return res.json({ received: true, ignored: event })
    }

    try {
      /* Источник истины — API, а не тело уведомления. */
      const payment = await getYookassaPayment(paymentId)

      if (payment.status !== "succeeded" || !payment.paid) {
        db.prepare(`UPDATE yookassa_payments SET status = ?, updated_at = ? WHERE id = ?`).run(
          payment.status,
          Date.now(),
          paymentId,
        )
        return res.json({ received: true, status: payment.status })
      }

      const userId = Number(payment.metadata?.userId)
      const plan = payment.metadata?.plan as PlanKey | undefined
      if (!userId || !plan || !PAID_PLANS.includes(plan as any)) {
        return res.status(400).json({ error: "В платеже нет корректных metadata.userId/plan" })
      }

      /* Идемпотентность: активируем ровно один раз. Атомарный переход
         status → 'succeeded' только если он ещё не 'succeeded'. */
      const claim = db
        .prepare(
          `UPDATE yookassa_payments SET status = 'succeeded', updated_at = ?
           WHERE id = ? AND status != 'succeeded'`,
        )
        .run(Date.now(), paymentId)

      if (claim.changes === 0) {
        /* Запись не найдена (payment создан не нами) или уже обработана. */
        const exists = db.prepare(`SELECT 1 FROM yookassa_payments WHERE id = ?`).get(paymentId)
        return res.json({ received: true, duplicate: !!exists })
      }

      const now = Date.now()
      upsertSubscription(userId, {
        plan,
        status: "active",
        current_period_start: now,
        current_period_end: now + PERIOD_MS,
        cancel_at_period_end: 0,
        canceled_at: null,
      })

      const amountRub = Number(payment.amount?.value) || 0
      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, 'subscription', ?, 'ЮKassa', ?, 'rub', 'done')`,
      ).run(userId, `Подписка ${plan} (ЮKassa)`, amountRub)

      logAudit(userId, "credit", amountRub, "subscription_yookassa_paid", { plan, paymentId })

      res.json({ received: true, activated: true })
    } catch (err: any) {
      captureError("[yookassa/webhook] error:", err)
      res.status(500).json({ error: err.message || "Ошибка обработки уведомления ЮKassa" })
    }
  }),
)

export default router
