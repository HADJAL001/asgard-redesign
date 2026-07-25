import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import stripe, { isStripeConfigured, FRONTEND_URL } from "../lib/stripe"
import {
  AcademyTier,
  ACADEMY_TIERS,
  ACADEMY_PRICE_IDS,
  ACADEMY_PRICES_USD,
  academyTierFromPriceId,
  isAcademyTier,
  isAcademyEnabled,
  academyTierLevel,
  getEnrollment,
  upsertEnrollment,
  serializeEnrollment,
  requireEnrollment,
} from "../lib/academy"
import { asyncHandler } from "../utils/async-handler"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"

/* ================================================================
   OSGARD ACADEMY ROUTES — «Founders Program»
   Платный курс от создателей + сертификация «OSGARD Certified Vibecoder».

   Отдельный вертикальный саб (см. lib/academy.ts). Переиспользует
   ПАТТЕРН subscription/addons (Stripe subscription-mode checkout +
   idempotent webhook через stripe_events + cancel), но существующие
   потоки монетизации не трогает.

   Фичефлаг ACADEMY_ENABLED (по умолчанию OFF): checkout отдаёт 503,
   витрина на фронте скрыта → поведение прода не меняется.

   Webhook secret: STRIPE_WEBHOOK_SECRET_ACADEMY (с фолбэком на общий
   STRIPE_WEBHOOK_SECRET, если отдельный endpoint не настроен).
   ================================================================ */

const router = Router()
const MOCK_PERIOD_MS = 30 * 24 * 60 * 60 * 1000 // 30 дней

const STRIPE_WEBHOOK_SECRET_ACADEMY =
  process.env.STRIPE_WEBHOOK_SECRET_ACADEMY || process.env.STRIPE_WEBHOOK_SECRET || ""

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active": return "active"
    case "trialing": return "trialing"
    case "past_due": return "past_due"
    case "canceled": return "canceled"
    case "unpaid": return "unpaid"
    default: return "inactive"
  }
}

/* ================================================================
   GET /academy/config   (публичный — фронт решает, показывать ли витрину)
   ================================================================ */
router.get("/config", (_req, res) => {
  res.json({
    enabled: isAcademyEnabled(),
    tiers: ACADEMY_TIERS.map((tier) => ({
      tier,
      priceUsd: ACADEMY_PRICES_USD[tier],
      level: academyTierLevel(tier),
    })),
  })
})

/* ================================================================
   GET /academy/status   (биллинг-состояние текущего пользователя)
   ================================================================ */
router.get("/status", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const enrollment = serializeEnrollment(getEnrollment(userId))
  res.json({
    enabled: isAcademyEnabled(),
    enrollment,
    tierLevel: enrollment.tier ? academyTierLevel(enrollment.tier) : -1,
  })
})

/* ================================================================
   POST /academy/checkout   body: { tier: 'founder_track' | 'founder_circle' }
   Stripe subscription-mode. mock-режим только вне production.
   ================================================================ */
router.post("/checkout", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  if (!isAcademyEnabled()) {
    return res.status(503).json({ error: "Программа скоро запустится.", code: "ACADEMY_DISABLED" })
  }

  const { tier } = req.body || {}
  if (!isAcademyTier(tier)) {
    return res.status(400).json({
      error: `Некорректный тир. Допустимые значения: ${ACADEMY_TIERS.join(", ")}`,
    })
  }

  const userId = req.user!.userId

  if (!isStripeConfigured || !stripe) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "Оплата временно недоступна. Попробуйте позже." })
    }

    const now = Date.now()
    upsertEnrollment(userId, {
      tier,
      status: "active",
      current_period_start: now,
      current_period_end: now + MOCK_PERIOD_MS,
      cancel_at_period_end: 0,
      canceled_at: null,
    })

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'subscription', ?, 'Stripe (mock)', ?, 'cash_usd', 'done')`,
    ).run(userId, `Academy: ${tier}`, 0)
    logAudit(userId, "credit", 0, "academy_mock_activated", { tier })

    return res.status(200).json({
      mock: true,
      url: null,
      message: "Stripe не настроен — запись в программу активирована локально (dev-режим).",
      enrollment: serializeEnrollment(getEnrollment(userId)),
    })
  }

  const priceId = ACADEMY_PRICE_IDS[tier]
  if (!priceId) {
    return res.status(500).json({ error: `Stripe Price ID для тира '${tier}' не настроен.` })
  }

  try {
    const user: any = db.prepare(`SELECT id, username, email FROM users WHERE id = ?`).get(userId)
    if (!user) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

    const existing = getEnrollment(userId)
    let customerId = existing?.stripe_customer_id || undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.username,
        metadata: { userId: String(userId) },
      })
      customerId = customer.id
      upsertEnrollment(userId, { tier, stripe_customer_id: customerId })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/academy?checkout=success&tier=${tier}`,
      cancel_url: `${FRONTEND_URL}/academy?checkout=cancel`,
      metadata: { userId: String(userId), academyTier: tier },
      subscription_data: {
        metadata: { userId: String(userId), academyTier: tier },
      },
    })

    res.status(200).json({ mock: false, url: session.url, sessionId: session.id })
  } catch (err: any) {
    captureError("[academy/checkout] Stripe error:", err)
    res.status(500).json({ error: err.message || "Не удалось создать Stripe Checkout Session" })
  }
}))

/* ================================================================
   POST /academy/webhook
   Монтируется в server.ts с express.raw() ДО express.json() —
   аналогично /addons/webhook и /subscription/webhook.
   ================================================================ */
router.post("/webhook", async (req, res) => {
  if (!isStripeConfigured || !stripe) {
    return res.status(503).json({ error: "Stripe не настроен на сервере" })
  }
  if (!STRIPE_WEBHOOK_SECRET_ACADEMY) {
    console.error("[academy/webhook] STRIPE_WEBHOOK_SECRET_ACADEMY не задан — вебхук отклонён")
    return res.status(503).json({ error: "Webhook secret не настроен на сервере" })
  }

  const signature = req.headers["stripe-signature"] as string | undefined
  if (!signature) {
    return res.status(400).json({ error: "Отсутствует заголовок stripe-signature" })
  }

  let event: any
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET_ACADEMY)
  } catch (err: any) {
    captureError("[academy/webhook] Signature verification failed:", err)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  const claim = db
    .prepare(`INSERT INTO stripe_events (id, type, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .run(event.id, event.type, Date.now())
  if (claim.changes === 0) {
    return res.json({ received: true, duplicate: true })
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        const userId = Number(session.metadata?.userId)
        const tier = session.metadata?.academyTier as AcademyTier | undefined

        if (userId && isAcademyTier(tier)) {
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription?.id

          let periodStart: number | null = null
          let periodEnd: number | null = null
          let priceId: string | null = null

          if (subscriptionId) {
            const stripeSub = await stripe.subscriptions.retrieve(subscriptionId)
            periodStart = (stripeSub as any).current_period_start * 1000
            periodEnd = (stripeSub as any).current_period_end * 1000
            priceId = stripeSub.items.data[0]?.price?.id || null
          }

          upsertEnrollment(userId, {
            tier,
            status: "active",
            stripe_customer_id:
              typeof session.customer === "string" ? session.customer : session.customer?.id,
            stripe_subscription_id: subscriptionId || null,
            stripe_price_id: priceId,
            current_period_start: periodStart,
            current_period_end: periodEnd,
            cancel_at_period_end: 0,
            canceled_at: null,
          })

          db.prepare(
            `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
             VALUES (?, 'subscription', ?, 'Stripe', ?, 'cash_usd', 'done')`,
          ).run(userId, `Academy: ${tier}`, (session.amount_total ?? 0) / 100)
          logAudit(userId, "credit", (session.amount_total ?? 0) / 100, "academy_stripe_checkout", {
            tier,
            stripe_event_id: event.id,
          })
        }
        break
      }

      case "customer.subscription.updated": {
        const stripeSub = event.data.object
        const userId = Number(stripeSub.metadata?.userId)
        const priceId = stripeSub.items?.data?.[0]?.price?.id || null
        const tier = (stripeSub.metadata?.academyTier as AcademyTier | undefined) || academyTierFromPriceId(priceId)

        if (userId && isAcademyTier(tier)) {
          upsertEnrollment(userId, {
            tier,
            status: mapStripeStatus(stripeSub.status),
            stripe_subscription_id: stripeSub.id,
            stripe_price_id: priceId,
            current_period_start: stripeSub.current_period_start ? stripeSub.current_period_start * 1000 : null,
            current_period_end: stripeSub.current_period_end ? stripeSub.current_period_end * 1000 : null,
            cancel_at_period_end: stripeSub.cancel_at_period_end ? 1 : 0,
          })
        }
        break
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object
        const userId = Number(stripeSub.metadata?.userId)
        const priceId = stripeSub.items?.data?.[0]?.price?.id || null
        const tier = (stripeSub.metadata?.academyTier as AcademyTier | undefined) || academyTierFromPriceId(priceId)

        if (userId && isAcademyTier(tier)) {
          upsertEnrollment(userId, {
            status: "canceled",
            cancel_at_period_end: 0,
            canceled_at: Date.now(),
          })
        }
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id

        const subRow = subscriptionId
          ? (db
              .prepare(`SELECT user_id, tier FROM academy_enrollments WHERE stripe_subscription_id = ?`)
              .get(subscriptionId) as { user_id: number; tier: AcademyTier } | undefined)
          : customerId
            ? (db
                .prepare(`SELECT user_id, tier FROM academy_enrollments WHERE stripe_customer_id = ?`)
                .get(customerId) as { user_id: number; tier: AcademyTier } | undefined)
            : undefined

        if (subRow) {
          db.prepare(
            `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text)
             VALUES (?, NULL, 'billing', 'academy_enrollment', NULL, ?)`,
          ).run(
            subRow.user_id,
            `Не удалось списать оплату за программу «${subRow.tier}». Обновите способ оплаты — иначе доступ будет ограничен.`,
          )

          db.prepare(
            `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
             VALUES (?, 'subscription', ?, 'Stripe', ?, 'cash_usd', 'failed')`,
          ).run(subRow.user_id, `Academy: ${subRow.tier} — платёж отклонён`, (invoice.amount_due ?? 0) / 100)

          logAudit(subRow.user_id, "debit", 0, "academy_payment_failed", {
            tier: subRow.tier,
            stripe_event_id: event.id,
          })
        }
        break
      }

      default:
        break
    }

    res.json({ received: true })
  } catch (err: any) {
    captureError("[academy/webhook] Handler error:", err)
    res.status(500).json({ error: err.message || "Ошибка обработки webhook" })
  }
})

/* ================================================================
   POST /academy/cancel
   ================================================================ */
router.post("/cancel", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const sub = getEnrollment(userId)

  if (!sub || sub.status === "inactive" || sub.status === "canceled") {
    return res.status(400).json({ error: "У вас нет активной записи в программу для отмены" })
  }

  try {
    if (isStripeConfigured && stripe && sub.stripe_subscription_id) {
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      upsertEnrollment(userId, {
        cancel_at_period_end: updated.cancel_at_period_end ? 1 : 0,
        status: mapStripeStatus(updated.status),
      })
    } else {
      upsertEnrollment(userId, { cancel_at_period_end: 1 })
    }

    res.json({
      success: true,
      enrollment: serializeEnrollment(getEnrollment(userId)),
      message: "Запись в программу будет отменена в конце оплаченного периода.",
    })
  } catch (err: any) {
    captureError("[academy/cancel] error:", err)
    res.status(500).json({ error: err.message || "Не удалось отменить запись в программу" })
  }
}))

/* ================================================================
   GET /academy/courses   (каталог + прогресс текущего пользователя)
   Доступ — активная запись минимум founder_track. Курсы founder_circle
   помечаются locked, если тир пользователя ниже circle.
   ================================================================ */
router.get("/courses", requireAuth, requireEnrollment("founder_track"), (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const enrollment = getEnrollment(userId)
  const userLevel = enrollment ? academyTierLevel(enrollment.tier) : -1

  const rows = db
    .prepare(
      `SELECT c.id, c.course_key, c.title, c.description, c.required_tier, c.order_index, c.xp_reward,
              p.status AS progress_status, p.progress_pct
       FROM academy_courses c
       LEFT JOIN academy_progress p ON p.course_id = c.id AND p.user_id = ?
       ORDER BY c.order_index ASC, c.id ASC`,
    )
    .all(userId) as Array<{
      id: number
      course_key: string
      title: string
      description: string
      required_tier: AcademyTier
      order_index: number
      xp_reward: number
      progress_status: string | null
      progress_pct: number | null
    }>

  const courses = rows.map((r) => ({
    courseKey: r.course_key,
    title: r.title,
    description: r.description,
    requiredTier: r.required_tier,
    orderIndex: r.order_index,
    xpReward: r.xp_reward,
    status: r.progress_status ?? "not_started",
    progressPct: r.progress_pct ?? 0,
    locked: academyTierLevel(r.required_tier) > userLevel,
  }))

  res.json({ courses })
})

/* ================================================================
   POST /academy/courses/:courseKey/progress
   body: { progressPct: number, status?: 'in_progress' | 'completed' }
   ================================================================ */
router.post(
  "/courses/:courseKey/progress",
  requireAuth,
  requireEnrollment("founder_track"),
  asyncHandler(async (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const { courseKey } = req.params
    const { progressPct, status } = req.body || {}

    const course = db
      .prepare(`SELECT id, required_tier FROM academy_courses WHERE course_key = ?`)
      .get(courseKey) as { id: number; required_tier: AcademyTier } | undefined
    if (!course) {
      return res.status(404).json({ error: "Курс не найден" })
    }

    const enrollment = getEnrollment(userId)
    const userLevel = enrollment ? academyTierLevel(enrollment.tier) : -1
    if (academyTierLevel(course.required_tier) > userLevel) {
      return res.status(403).json({ error: "Этот курс доступен на более высоком тире программы." })
    }

    const pct = Math.max(0, Math.min(100, Math.floor(Number(progressPct) || 0)))
    const nextStatus: "in_progress" | "completed" =
      status === "completed" || pct >= 100 ? "completed" : "in_progress"
    const now = Date.now()
    const completedAt = nextStatus === "completed" ? now : null

    db.prepare(
      `INSERT INTO academy_progress (user_id, course_id, status, progress_pct, completed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, course_id) DO UPDATE SET
         status = excluded.status,
         progress_pct = excluded.progress_pct,
         completed_at = COALESCE(academy_progress.completed_at, excluded.completed_at),
         updated_at = excluded.updated_at`,
    ).run(userId, course.id, nextStatus, nextStatus === "completed" ? 100 : pct, completedAt, now, now)

    res.json({
      success: true,
      courseKey,
      status: nextStatus,
      progressPct: nextStatus === "completed" ? 100 : pct,
    })
  }),
)

export default router
