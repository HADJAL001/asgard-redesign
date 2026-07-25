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
import { computeEligibility } from "../lib/certification"
import { requireAdmin } from "../middleware/admin.middleware"
import {
  getActiveCertificate,
  getCertificateById,
  issueCertificate,
  revokeCertificate,
  serializeCertificate,
  holderNameOf,
} from "../lib/certificate"

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

/* ================================================================
   GET /academy/certification/eligibility   («Экзамен делом»)
   Право на credential «OSGARD Certified Vibecoder» не покупается —
   оно вычисляется из уже накопленных реальных достижений пользователя
   (тир Архитектора, задеплоенные проекты, craft_score, авторство).
   Чистое чтение существующих таблиц; доступно любому авторизованному
   пользователю (прогресс виден до и без активной подписки — это апселл).
   ================================================================ */
router.get("/certification/eligibility", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const result = computeEligibility(userId)

  // Активная запись в программе — контекст для фронта (нужна для claim в Фазе 3),
  // но НЕ обязательна, чтобы увидеть свой прогресс.
  const enrollment = getEnrollment(userId)
  const enrolled = !!enrollment && ["active", "trialing"].includes(enrollment.status)

  res.json({ ...result, enrolled })
})

/* ================================================================
   GET /academy/certification/my   (свой credential, если выдан)
   Приватный: владелец видит свой сертификат с полным снимком.
   ================================================================ */
router.get("/certification/my", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const cert = getActiveCertificate(userId)
  if (!cert) return res.json({ certificate: null })
  res.json({ certificate: serializeCertificate(cert, holderNameOf(userId)) })
})

/* ================================================================
   POST /academy/certification/claim   (выпуск credential)
   Двойной guard: активная запись в программе И «экзамен делом» пройден
   (computeEligibility().eligible). Иначе 403 — credential не покупается.
   Идемпотентно: если активный сертификат уже есть — возвращаем его (200),
   без выпуска второго (partial-unique index — последняя линия защиты).
   ================================================================ */
router.post("/certification/claim", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  // Уже есть активный credential — идемпотентный ответ, не плодим дубли.
  const existing = getActiveCertificate(userId)
  if (existing) {
    return res.status(200).json({
      certificate: serializeCertificate(existing, holderNameOf(userId)),
      alreadyIssued: true,
    })
  }

  // Guard 1: активная запись в программе (любой тир программы).
  const enrollment = getEnrollment(userId)
  const enrolled = !!enrollment && ["active", "trialing"].includes(enrollment.status)
  if (!enrolled) {
    return res.status(403).json({
      error: "Нужна активная запись в программу, чтобы получить credential.",
      code: "NOT_ENROLLED",
    })
  }

  // Guard 2: «экзамен делом» пройден — все критерии выполнены.
  const eligibility = computeEligibility(userId)
  if (!eligibility.eligible) {
    return res.status(403).json({
      error: "Не все критерии «экзамена делом» выполнены. Credential нельзя купить — только заслужить.",
      code: "NOT_ELIGIBLE",
      metCount: eligibility.metCount,
      totalCount: eligibility.totalCount,
    })
  }

  try {
    const cert = issueCertificate(userId, enrollment!.tier, holderNameOf(userId))
    logAudit(userId, "credit", 0, "academy_credential_issued", { serial: cert.serial, tier: cert.tier })
    return res.status(201).json({
      certificate: serializeCertificate(cert, holderNameOf(userId)),
      alreadyIssued: false,
    })
  } catch (err: any) {
    // Гонка: partial-unique index не дал второй активный — отдаём существующий.
    const raced = getActiveCertificate(userId)
    if (raced) {
      return res.status(200).json({
        certificate: serializeCertificate(raced, holderNameOf(userId)),
        alreadyIssued: true,
      })
    }
    captureError("[academy/certification/claim] issue failed:", err)
    return res.status(500).json({ error: "Не удалось выпустить credential. Попробуйте позже." })
  }
})

/* ================================================================
   POST /academy/certification/:id/revoke   (отзыв — только админ)
   body: { reason?: string }. Идемпотентно.
   ================================================================ */
router.post("/certification/:id/revoke", requireAdmin, (req: AuthRequest, res) => {
  const adminId = req.user!.userId
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Некорректный id сертификата" })
  }

  const row = getCertificateById(id)
  if (!row) return res.status(404).json({ error: "Сертификат не найден" })

  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : undefined
  const updated = revokeCertificate(id, adminId, reason)
  logAudit(adminId, "rejected", 0, "academy_credential_revoked", {
    serial: row.serial,
    holderUserId: row.user_id,
    reason: reason ?? null,
  })
  res.json({ certificate: serializeCertificate(updated!, holderNameOf(row.user_id)) })
})

/* ================================================================
   MENTOR SESSIONS — «Встреча с создателями» (Фаза 4)
   ================================================================
   «Одна встреча с создателями» — капируемая привилегия ВЕРХНЕГО тира
   `founder_circle`: ≤1 слот в календарный месяц (period_ym='YYYY-MM').
   Лимит гарантируется НА УРОВНЕ БД (partial-unique index в миграции
   085 по (user_id, period_ym) для не-canceled) → гонка двух request'ов
   упрётся в UNIQUE, а не проскочит обе.

   Уведомления — только в ПРИВАТНЫЙ канал `notifications` (не в
   публичную ленту activity_events): факт запроса встречи с создателями
   — личные данные пользователя, их нельзя транслировать в общий фид.
   ================================================================ */

/** Текущий календарный месяц в UTC как 'YYYY-MM' — ключ месячного лимита слотов. */
function currentPeriodYm(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, "0")
  return `${y}-${m}`
}

type MentorSessionRow = {
  id: number
  user_id: number
  tier: string
  status: string
  source: string
  requested_slot: string | null
  period_ym: string
  notes: string | null
  confirmed_at: number | null
  confirmed_by: number | null
  completed_at: number | null
  created_at: number
  updated_at: number
}

function serializeMentorSession(row: MentorSessionRow) {
  return {
    id: row.id,
    tier: row.tier,
    status: row.status,
    source: row.source,
    requestedSlot: row.requested_slot,
    periodYm: row.period_ym,
    notes: row.notes,
    confirmedAt: row.confirmed_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/* ================================================================
   POST /academy/mentor/request   body: { requestedSlot?, notes? }
   Guard: активная запись тира founder_circle (иначе 403).
   Лимит: ≤1 не-отменённый слот в текущем period_ym (иначе 409).
   ================================================================ */
router.post(
  "/mentor/request",
  requireAuth,
  requireEnrollment("founder_circle"),
  (req: AuthRequest, res) => {
    const userId = req.user!.userId
    const enrollment = getEnrollment(userId)!
    const periodYm = currentPeriodYm()

    const requestedSlot =
      typeof req.body?.requestedSlot === "string" ? req.body.requestedSlot.trim().slice(0, 200) : null
    const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : null

    try {
      const info = db
        .prepare(
          `INSERT INTO mentor_sessions (user_id, tier, status, source, requested_slot, period_ym, notes)
           VALUES (?, ?, 'requested', 'subscription', ?, ?, ?)`,
        )
        .run(userId, enrollment.tier, requestedSlot || null, periodYm, notes)

      const row = db
        .prepare(`SELECT * FROM mentor_sessions WHERE id = ?`)
        .get(Number(info.lastInsertRowid)) as MentorSessionRow

      db.prepare(
        `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text)
         VALUES (?, NULL, 'mentor', 'mentor_session', ?, ?)`,
      ).run(
        userId,
        row.id,
        "Заявка на встречу с создателями принята. Мы подтвердим слот и свяжемся с вами.",
      )

      return res.status(201).json({ session: serializeMentorSession(row) })
    } catch (err: any) {
      // partial-unique index (user_id, period_ym) WHERE status != 'canceled' —
      // атомарная защита от второго слота в том же месяце.
      const msg = String(err?.code || err?.message || "")
      if (msg.includes("SQLITE_CONSTRAINT") || msg.includes("UNIQUE")) {
        return res.status(409).json({
          error: "В этом месяце у вас уже есть слот встречи с создателями. Новый доступен со следующего месяца.",
          code: "MENTOR_SLOT_TAKEN",
          periodYm,
        })
      }
      captureError("[academy/mentor/request] insert failed:", err)
      return res.status(500).json({ error: "Не удалось создать заявку на встречу. Попробуйте позже." })
    }
  },
)

/* ================================================================
   GET /academy/mentor/my   (свои сессии — новые сверху)
   Доступно любому авторизованному (не-circle просто получит пусто).
   ================================================================ */
router.get("/mentor/my", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const rows = db
    .prepare(`SELECT * FROM mentor_sessions WHERE user_id = ? ORDER BY created_at DESC`)
    .all(userId) as MentorSessionRow[]

  const periodYm = currentPeriodYm()
  const hasActiveThisMonth = rows.some((r) => r.period_ym === periodYm && r.status !== "canceled")

  res.json({
    sessions: rows.map(serializeMentorSession),
    periodYm,
    canRequest: !hasActiveThisMonth,
  })
})

/* ================================================================
   POST /academy/mentor/:id/confirm   (создатель/админ подтверждает слот)
   ================================================================ */
router.post("/mentor/:id/confirm", requireAdmin, (req: AuthRequest, res) => {
  const adminId = req.user!.userId
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Некорректный id сессии" })
  }

  const row = db.prepare(`SELECT * FROM mentor_sessions WHERE id = ?`).get(id) as MentorSessionRow | undefined
  if (!row) return res.status(404).json({ error: "Сессия не найдена" })
  if (row.status === "canceled" || row.status === "completed") {
    return res.status(400).json({ error: `Сессию нельзя подтвердить из статуса '${row.status}'.` })
  }

  const now = Date.now()
  db.prepare(
    `UPDATE mentor_sessions SET status = 'confirmed', confirmed_at = ?, confirmed_by = ?, updated_at = ? WHERE id = ?`,
  ).run(now, adminId, now, id)

  db.prepare(
    `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text)
     VALUES (?, ?, 'mentor', 'mentor_session', ?, ?)`,
  ).run(row.user_id, adminId, id, "Ваша встреча с создателями подтверждена. Детали слота придут отдельно.")

  logAudit(adminId, "credit", 0, "academy_mentor_confirmed", { sessionId: id, holderUserId: row.user_id })

  const updated = db.prepare(`SELECT * FROM mentor_sessions WHERE id = ?`).get(id) as MentorSessionRow
  res.json({ session: serializeMentorSession(updated) })
})

/* ================================================================
   POST /academy/mentor/:id/complete   (встреча состоялась)
   ================================================================ */
router.post("/mentor/:id/complete", requireAdmin, (req: AuthRequest, res) => {
  const adminId = req.user!.userId
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Некорректный id сессии" })
  }

  const row = db.prepare(`SELECT * FROM mentor_sessions WHERE id = ?`).get(id) as MentorSessionRow | undefined
  if (!row) return res.status(404).json({ error: "Сессия не найдена" })
  if (row.status !== "confirmed") {
    return res.status(400).json({ error: "Завершить можно только подтверждённую встречу." })
  }

  const now = Date.now()
  db.prepare(
    `UPDATE mentor_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
  ).run(now, now, id)

  db.prepare(
    `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text)
     VALUES (?, ?, 'mentor', 'mentor_session', ?, ?)`,
  ).run(row.user_id, adminId, id, "Встреча с создателями завершена. Спасибо, что строите с OSGARD.")

  logAudit(adminId, "credit", 0, "academy_mentor_completed", { sessionId: id, holderUserId: row.user_id })

  const updated = db.prepare(`SELECT * FROM mentor_sessions WHERE id = ?`).get(id) as MentorSessionRow
  res.json({ session: serializeMentorSession(updated) })
})

export default router
