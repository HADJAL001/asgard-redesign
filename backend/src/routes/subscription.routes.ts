 import { Router, Response, NextFunction } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import stripe, {
  isStripeConfigured,
  STRIPE_WEBHOOK_SECRET,
  PLAN_PRICE_IDS,
  planLevel,
  FRONTEND_URL,
  PlanKey,
} from "../lib/stripe"
import { asyncHandler } from "../utils/async-handler"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"
import { getAiUsage, AI_LIMITS_BY_PLAN } from "../lib/aiDailyUsage"


const router = Router()

const PAID_PLANS: Exclude<PlanKey, "free">[] = ["architect", "master", "legend"]
const MOCK_PERIOD_MS  = 30 * 24 * 60 * 60 * 1000 // 30 дней
const TRIAL_PERIOD_MS =  7 * 24 * 60 * 60 * 1000 //  7 дней
const TRIAL_DAYS      = 7

/* ================================================================
   Вспомогательные функции работы с таблицей subscriptions
   ================================================================ */

type SubscriptionRow = {
  id: number
  user_id: number
  plan: string
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  current_period_start: number | null
  current_period_end: number | null
  cancel_at_period_end: number
  canceled_at: number | null
  trial_used: number
  created_at: number
  updated_at: number
}

function getSubscription(userId: number): SubscriptionRow | undefined {
  return db.prepare(`SELECT * FROM subscriptions WHERE user_id = ?`).get(userId) as
    | SubscriptionRow
    | undefined
}

function upsertSubscription(userId: number, fields: Partial<SubscriptionRow>) {
  const existing = getSubscription(userId)
  const now = Date.now()

  if (!existing) {
    db.prepare(
      `INSERT INTO subscriptions (
        user_id, plan, status, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        current_period_start, current_period_end, cancel_at_period_end, canceled_at,
        trial_used, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      fields.plan ?? "free",
      fields.status ?? "inactive",
      fields.stripe_customer_id ?? null,
      fields.stripe_subscription_id ?? null,
      fields.stripe_price_id ?? null,
      fields.current_period_start ?? null,
      fields.current_period_end ?? null,
      fields.cancel_at_period_end ?? 0,
      fields.canceled_at ?? null,
      fields.trial_used ?? 0,
      now,
      now,
    )
  } else {
    db.prepare(
      `UPDATE subscriptions SET
        plan = ?, status = ?, stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?,
        current_period_start = ?, current_period_end = ?, cancel_at_period_end = ?, canceled_at = ?,
        trial_used = ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(
      fields.plan ?? existing.plan,
      fields.status ?? existing.status,
      fields.stripe_customer_id ?? existing.stripe_customer_id,
      fields.stripe_subscription_id ?? existing.stripe_subscription_id,
      fields.stripe_price_id ?? existing.stripe_price_id,
      fields.current_period_start ?? existing.current_period_start,
      fields.current_period_end ?? existing.current_period_end,
      fields.cancel_at_period_end ?? existing.cancel_at_period_end,
      fields.canceled_at ?? existing.canceled_at,
      fields.trial_used ?? existing.trial_used ?? 0,
      now,
      userId,
    )
  }

  /* Синхронизируем users.plan для быстрых проверок без JOIN */
  const finalPlan = fields.plan ?? existing?.plan ?? "free"
  db.prepare(`UPDATE users SET plan = ? WHERE id = ?`).run(finalPlan, userId)
}

function serializeSubscription(sub: SubscriptionRow | undefined) {
  if (!sub) {
    return {
      plan: "free" as PlanKey,
      status: "inactive",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      trialUsed: false,
    }
  }
  return {
    plan: sub.plan as PlanKey,
    status: sub.status,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    canceledAt: sub.canceled_at,
    trialUsed: !!sub.trial_used,
  }
}

/* Проверяет, использовал ли пользователь триал на данный план */
function hasUsedTrial(userId: number, plan: string): boolean {
  const row = db
    .prepare(`SELECT id FROM trial_history WHERE user_id = ? AND plan = ?`)
    .get(userId, plan)
  return !!row
}

function planFromPriceId(priceId: string | null | undefined): PlanKey | null {
  if (!priceId) return null
  for (const plan of PAID_PLANS) {
    if (PLAN_PRICE_IDS[plan] && PLAN_PRICE_IDS[plan] === priceId) return plan
  }
  return null
}

/* ================================================================
   requirePlan(plan) — middleware проверки доступа по плану подписки.

   Иерархическая проверка: пропускает пользователей с планом >= plan
   (по уровню PLAN_ORDER). Для платных планов дополнительно требуется
   status IN ('active', 'trialing'). План 'free' доступен всегда.
   ================================================================ */
export function requirePlan(requiredPlan: PlanKey) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Требуется авторизация" })
    }

    if (requiredPlan === "free") return next()

    const sub = getSubscription(req.user.userId)
    const currentPlan = (sub?.plan ?? "free") as PlanKey
    const status = sub?.status ?? "inactive"

    const hasLevel = planLevel(currentPlan) >= planLevel(requiredPlan)
    const hasActiveStatus = status === "active" || status === "trialing"

    if (!hasLevel || !hasActiveStatus) {
      return res.status(403).json({
        error: `Недостаточный уровень подписки. Требуется план: ${requiredPlan} или выше.`,
        currentPlan,
        currentStatus: status,
        requiredPlan,
      })
    }

    next()
  }
}

/* ================================================================
   POST /subscription/create-checkout
   Создаёт Stripe Checkout Session для оформления платной подписки.

   body: { plan: 'architect' | 'master' | 'legend' }

   Если Stripe не настроен (нет STRIPE_SECRET_KEY) — работает в
   mock-режиме: сразу активирует подписку локально на 30 дней и
   возвращает { mock: true, subscription } без реального url Stripe.
   ================================================================ */
router.post("/create-checkout", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { plan } = req.body || {}

  if (!PAID_PLANS.includes(plan)) {
    return res.status(400).json({
      error: `Некорректный план. Допустимые платные планы: ${PAID_PLANS.join(", ")}`,
    })
  }

  const userId = req.user!.userId

  /* ---------------- Mock-режим (Stripe не настроен) ----------------
     Доступен только вне production — иначе случайно незаданный
     STRIPE_SECRET_KEY на проде молча активировал бы платный план без
     реальной оплаты. */
  if (!isStripeConfigured || !stripe) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({
        error: "Оплата временно недоступна. Попробуйте позже.",
      })
    }

    const now = Date.now()
    upsertSubscription(userId, {
      plan,
      status: "active",
      current_period_start: now,
      current_period_end: now + MOCK_PERIOD_MS,
      cancel_at_period_end: 0,
      canceled_at: null,
    })

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'subscription', ?, 'Stripe (mock)', ?, 'cash_usd', 'done')`,
    ).run(userId, `Подписка ${plan}`, 0)
    logAudit(userId, "credit", 0, "subscription_mock_activated", { plan })

    return res.status(200).json({
      mock: true,
      url: null,
      message: "Stripe не настроен — подписка активирована локально (dev-режим).",
      subscription: serializeSubscription(getSubscription(userId)),
    })
  }

  /* ---------------- Реальный режим Stripe ---------------- */
  const priceId = PLAN_PRICE_IDS[plan as Exclude<PlanKey, "free">]
  if (!priceId) {
    return res.status(500).json({
      error: `Stripe Price ID для плана '${plan}' не настроен (STRIPE_PRICE_${plan.toUpperCase()})`,
    })
  }

  try {
    const user: any = db
      .prepare(`SELECT id, username, email FROM users WHERE id = ?`)
      .get(userId)
    if (!user) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

    let existingSub = getSubscription(userId)
    let customerId = existingSub?.stripe_customer_id || undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.username,
        metadata: { userId: String(userId) },
      })
      customerId = customer.id
      upsertSubscription(userId, { stripe_customer_id: customerId })
    }

    /* Предлагаем триал только если пользователь ещё не использовал его на этот план */
    const trialEligible = !hasUsedTrial(userId, plan)

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/wallet?checkout=success&plan=${plan}`,
      cancel_url: `${FRONTEND_URL}/wallet?checkout=cancel`,
      metadata: { userId: String(userId), plan },
      subscription_data: {
        metadata: { userId: String(userId), plan },
        ...(trialEligible ? { trial_period_days: TRIAL_DAYS } : {}),
      },
    })

    res.status(200).json({
      mock: false,
      url: session.url,
      sessionId: session.id,
    })
  } catch (err: any) {
    captureError("[subscription/create-checkout] Stripe error:", err)
    res.status(500).json({ error: err.message || "Не удалось создать Stripe Checkout Session" })
  }
}))

/* ================================================================
   POST /subscription/webhook
   Обрабатывает события Stripe:
   - checkout.session.completed
   - customer.subscription.updated
   - customer.subscription.deleted

   Важно: этот роут монтируется в server.ts с express.raw()
   ДО express.json(), чтобы req.body был Buffer для проверки подписи.
   ================================================================ */
router.post("/webhook", async (req, res) => {
  if (!isStripeConfigured || !stripe) {
    return res.status(503).json({ error: "Stripe не настроен на сервере" })
  }

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error("[subscription/webhook] STRIPE_WEBHOOK_SECRET не задан — вебхук отклонён")
    return res.status(503).json({ error: "Webhook secret не настроен на сервере" })
  }

  const signature = req.headers["stripe-signature"] as string | undefined
  if (!signature) {
    return res.status(400).json({ error: "Отсутствует заголовок stripe-signature" })
  }

  let event: any
  try {
    /* req.body здесь — Buffer (raw), т.к. роут смонтирован с express.raw() */
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET)
  } catch (err: any) {
    captureError("[subscription/webhook] Signature verification failed:", err)
    return res.status(400).json({ error: `Webhook Error: ${err.message}` })
  }

  /* Идемпотентность: Stripe гарантированно повторяет доставку webhook при
     таймауте/5xx/сетевой ошибке на нашей стороне. Атомарная вставка с
     ON CONFLICT DO NOTHING — если event.id уже обработан, changes === 0,
     и мы отвечаем 200 без повторной обработки (иначе Stripe продолжит ретраить). */
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
        const plan = session.metadata?.plan as PlanKey | undefined

        if (userId && plan) {
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

          upsertSubscription(userId, {
            plan,
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
          ).run(userId, `Подписка ${plan}`, (session.amount_total ?? 0) / 100)
          logAudit(userId, "credit", (session.amount_total ?? 0) / 100, "subscription_stripe_checkout", { plan, stripe_event_id: event.id })
        }
        break
      }

      case "customer.subscription.updated": {
        const stripeSub = event.data.object
        const userId = Number(stripeSub.metadata?.userId)
        const priceId = stripeSub.items?.data?.[0]?.price?.id || null
        const plan = planFromPriceId(priceId)

        if (userId) {
          upsertSubscription(userId, {
            plan: plan ?? undefined,
            status: mapStripeStatus(stripeSub.status),
            stripe_subscription_id: stripeSub.id,
            stripe_price_id: priceId,
            current_period_start: stripeSub.current_period_start
              ? stripeSub.current_period_start * 1000
              : null,
            current_period_end: stripeSub.current_period_end
              ? stripeSub.current_period_end * 1000
              : null,
            cancel_at_period_end: stripeSub.cancel_at_period_end ? 1 : 0,
          })
        }
        break
      }

      case "customer.subscription.deleted": {
        const stripeSub = event.data.object
        const userId = Number(stripeSub.metadata?.userId)

        if (userId) {
          upsertSubscription(userId, {
            plan: "free",
            status: "canceled",
            cancel_at_period_end: 0,
            canceled_at: Date.now(),
          })
        }
        break
      }

      default:
        /* Остальные события Stripe игнорируем */
        break
    }

    res.json({ received: true })
  } catch (err: any) {
    captureError("[subscription/webhook] Handler error:", err)
    res.status(500).json({ error: err.message || "Ошибка обработки webhook" })
  }
})

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active":
      return "active"
    case "trialing":
      return "trialing"
    case "past_due":
      return "past_due"
    case "canceled":
      return "canceled"
    case "unpaid":
      return "unpaid"
    default:
      return "inactive"
  }
}

/* ================================================================
   GET /subscription/status
   Возвращает текущий план и статус подписки пользователя.
   Если записи в subscriptions нет — fallback на free/inactive.
   ================================================================ */
router.get("/status", requireAuth, (req: AuthRequest, res) => {
  const sub = getSubscription(req.user!.userId)
  res.json({ subscription: serializeSubscription(sub) })
})

/* ================================================================
   GET /subscription/ai-usage
   Возвращает дневное использование AI по провайдерам и лимиты
   для текущего пользователя в зависимости от его тарифного плана.

   Структура ответа:
   {
     plan: "free" | "architect" | "master" | "legend",
     limits: { claude: number, grok: number, deepseek: number, total: number },
     used:   { claude: number, grok: number, deepseek: number, total: number },
     remaining: { claude: number, grok: number, deepseek: number, total: number },
     resetsAt: number  // timestamp начала следующего UTC-дня
   }

   Использование считается через таблицу ai_daily_usage (создаётся
   миграцией 041_ai_daily_usage).
   ================================================================ */
router.get("/ai-usage", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
  const plan = (userRow?.plan ?? "free") as string

  const limits = AI_LIMITS_BY_PLAN[plan] ?? AI_LIMITS_BY_PLAN.free
  const used = await getAiUsage(userId)

  const now = new Date()
  const nextMidnightUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)

  res.json({
    plan,
    limits,
    used,
    remaining: {
      claude:   limits.claude   === null ? null : Math.max(0, limits.claude   - used.claude),
      grok:     limits.grok     === null ? null : Math.max(0, limits.grok     - used.grok),
      deepseek: limits.deepseek === null ? null : Math.max(0, limits.deepseek - used.deepseek),
      total:    limits.total    === null ? null : Math.max(0, limits.total    - used.total),
    },
    resetsAt: nextMidnightUtc,
  })
}))

/* ================================================================
   POST /subscription/cancel
   Отменяет подписку (cancel_at_period_end = true).

   Если у пользователя есть реальная Stripe-подписка — отменяем через
   Stripe API (подписка остаётся активной до конца периода).
   Если Stripe не настроен или stripe_subscription_id отсутствует —
   помечаем cancel_at_period_end локально в БД (mock-режим).
   ================================================================ */
router.post("/cancel", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const sub = getSubscription(userId)

  if (!sub || sub.plan === "free") {
    return res.status(400).json({ error: "У вас нет активной платной подписки для отмены" })
  }

  try {
    if (isStripeConfigured && stripe && sub.stripe_subscription_id) {
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      })

      upsertSubscription(userId, {
        cancel_at_period_end: updated.cancel_at_period_end ? 1 : 0,
        status: mapStripeStatus(updated.status),
      })
    } else {
      /* Mock-режим: помечаем локально, план останется активным до current_period_end */
      upsertSubscription(userId, {
        cancel_at_period_end: 1,
      })
    }

    res.json({
      success: true,
      subscription: serializeSubscription(getSubscription(userId)),
      message: "Подписка будет отменена в конце оплаченного периода.",
    })
  } catch (err: any) {
    captureError("[subscription/cancel] error:", err)
    res.status(500).json({ error: err.message || "Не удалось отменить подписку" })
  }
})

/* ================================================================
   GET /subscription/trial-status
   Возвращает, может ли пользователь воспользоваться триалом на план.
   body query: ?plan=architect|master|legend
   ================================================================ */
router.get("/trial-status", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const plan = req.query.plan as string | undefined

  if (!plan || !PAID_PLANS.includes(plan as any)) {
    return res.status(400).json({ error: "Укажите корректный план: architect, master или legend" })
  }

  const used = hasUsedTrial(userId, plan)
  const trialRow = used
    ? (db.prepare(`SELECT ends_at FROM trial_history WHERE user_id = ? AND plan = ?`).get(userId, plan) as any)
    : null

  res.json({
    plan,
    eligible: !used,
    trialDays: TRIAL_DAYS,
    trialEndsAt: trialRow?.ends_at ?? null,
  })
})

/* ================================================================
   POST /subscription/start-trial
   Активирует 7-дневный бесплатный триал.

   В реальном режиме Stripe — создаёт Checkout Session с привязкой
   карты и trial_period_days: 7 (оплата спишется после триала).
   В mock-режиме (dev) — сразу активирует trialing-статус локально.

   Каждый пользователь может использовать триал только 1 раз
   на каждый платный план.
   ================================================================ */
router.post("/start-trial", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { plan } = req.body || {}

  if (!PAID_PLANS.includes(plan)) {
    return res.status(400).json({
      error: `Некорректный план. Допустимые платные планы: ${PAID_PLANS.join(", ")}`,
    })
  }

  const userId = req.user!.userId

  /* Проверяем, не использовал ли уже триал */
  if (hasUsedTrial(userId, plan)) {
    return res.status(409).json({
      error: `Вы уже использовали бесплатный триал для плана «${plan}». Триал доступен 1 раз на план.`,
      trialUsed: true,
    })
  }

  const now  = Date.now()
  const ends = now + TRIAL_PERIOD_MS

  /* ── Mock-режим ── */
  if (!isStripeConfigured || !stripe) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "Оплата временно недоступна. Попробуйте позже." })
    }

    upsertSubscription(userId, {
      plan,
      status: "trialing",
      current_period_start: now,
      current_period_end: ends,
      cancel_at_period_end: 0,
      canceled_at: null,
      trial_used: 1,
    })

    /* Фиксируем использование триала */
    db.prepare(
      `INSERT OR IGNORE INTO trial_history (user_id, plan, started_at, ends_at) VALUES (?, ?, ?, ?)`,
    ).run(userId, plan, now, ends)

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'subscription', ?, 'OSGARD (trial)', 0, 'cash_usd', 'done')`,
    ).run(userId, `Триал ${plan} — 7 дней`)

    logAudit(userId, "credit", 0, "trial_activated_mock", { plan, ends })

    return res.status(200).json({
      mock: true,
      url: null,
      message: `Триал «${plan}» активирован на 7 дней (dev-режим).`,
      subscription: serializeSubscription(getSubscription(userId)),
      trialEndsAt: ends,
    })
  }

  /* ── Реальный Stripe-режим ── */
  const priceId = PLAN_PRICE_IDS[plan as Exclude<PlanKey, "free">]
  if (!priceId) {
    return res.status(500).json({
      error: `Stripe Price ID для плана '${plan}' не настроен (STRIPE_PRICE_${plan.toUpperCase()})`,
    })
  }

  try {
    const user: any = db.prepare(`SELECT id, username, email FROM users WHERE id = ?`).get(userId)
    if (!user) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

    let existingSub = getSubscription(userId)
    let customerId = existingSub?.stripe_customer_id || undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.username,
        metadata: { userId: String(userId) },
      })
      customerId = customer.id
      upsertSubscription(userId, { stripe_customer_id: customerId })
    }

    /* Checkout с привязкой карты + триал. Оплата спишется после 7 дней.
       trial_history заполняется в webhook checkout.session.completed. */
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/wallet?checkout=trial&plan=${plan}`,
      cancel_url:  `${FRONTEND_URL}/pricing?trial=cancel`,
      metadata: { userId: String(userId), plan, isTrial: "1" },
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: { userId: String(userId), plan, isTrial: "1" },
      },
      /* Обязательная привязка карты при триале */
      payment_method_collection: "always",
    })

    res.status(200).json({
      mock: false,
      url: session.url,
      sessionId: session.id,
      trialDays: TRIAL_DAYS,
    })
  } catch (err: any) {
    captureError("[subscription/start-trial] Stripe error:", err)
    res.status(500).json({ error: err.message || "Не удалось создать триальную сессию Stripe" })
  }
}))

export default router
