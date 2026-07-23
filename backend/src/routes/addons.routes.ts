import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import stripe, { isStripeConfigured, STRIPE_WEBHOOK_SECRET_ADDONS, FRONTEND_URL } from "../lib/stripe"
import {
  AddonKey,
  ADDON_KEYS,
  ADDON_PRODUCT,
  ADDON_PRICE_IDS,
  addonFromPriceId,
  getAddonSubscription,
  upsertAddonSubscription,
  serializeAddonSubscription,
} from "../lib/addons"
import { getAddonProgress } from "../lib/addonProgression"
import { asyncHandler } from "../utils/async-handler"
import { captureError } from "../lib/sentry"
import { logAudit } from "../lib/audit"

/* ================================================================
   OSGARD ADDON ROUTES — ДЖАРВИС / ВАЛЛИ Premium ($99/мес каждый)

   Параллельная (не иерархическая) система, независимая от основных
   тарифов (см. subscription.routes.ts). Оба addon-ключа фиксированы
   по цене $99/мес, без скидок за покупку обоих сразу.
   ================================================================ */

const router = Router()
const MOCK_PERIOD_MS = 30 * 24 * 60 * 60 * 1000 // 30 дней

function isAddonKey(value: unknown): value is AddonKey {
  return typeof value === "string" && (ADDON_KEYS as string[]).includes(value)
}

/* ================================================================
   GET /addons/status
   Возвращает биллинг-статус и прогресс (level/xp/tier) по обоим
   addon-продуктам для текущего пользователя.
   ================================================================ */
router.get("/status", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId

  const result = ADDON_KEYS.map((addonKey) => {
    const product = ADDON_PRODUCT[addonKey]
    const sub = getAddonSubscription(userId, addonKey)
    const progress = getAddonProgress(userId, product)

    return {
      ...serializeAddonSubscription(sub, addonKey),
      product,
      progress: progress
        ? { level: progress.level, xp: progress.xp, tier: progress.tier }
        : { level: 1, xp: 0, tier: "premium" as const },
    }
  })

  res.json({ addons: result })
})

/* ================================================================
   POST /addons/create-checkout
   body: { addonKey: 'jarvis_premium' | 'walli_premium' }

   Если Stripe не настроен — mock-режим (только вне production):
   активирует addon-подписку локально на 30 дней.
   ================================================================ */
router.post("/create-checkout", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { addonKey } = req.body || {}

  if (!isAddonKey(addonKey)) {
    return res.status(400).json({
      error: `Некорректный addon-ключ. Допустимые значения: ${ADDON_KEYS.join(", ")}`,
    })
  }

  const userId = req.user!.userId

  if (!isStripeConfigured || !stripe) {
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ error: "Оплата временно недоступна. Попробуйте позже." })
    }

    const now = Date.now()
    upsertAddonSubscription(userId, addonKey, {
      status: "active",
      current_period_start: now,
      current_period_end: now + MOCK_PERIOD_MS,
      cancel_at_period_end: 0,
      canceled_at: null,
    })

    db.prepare(
      `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
       VALUES (?, 'subscription', ?, 'Stripe (mock)', ?, 'cash_usd', 'done')`,
    ).run(userId, `Addon: ${addonKey}`, 0)
    logAudit(userId, "credit", 0, "addon_mock_activated", { addonKey })

    return res.status(200).json({
      mock: true,
      url: null,
      message: "Stripe не настроен — addon-подписка активирована локально (dev-режим).",
      subscription: serializeAddonSubscription(getAddonSubscription(userId, addonKey), addonKey),
    })
  }

  const priceId = ADDON_PRICE_IDS[addonKey]
  if (!priceId) {
    return res.status(500).json({
      error: `Stripe Price ID для addon '${addonKey}' не настроен.`,
    })
  }

  try {
    const user: any = db.prepare(`SELECT id, username, email FROM users WHERE id = ?`).get(userId)
    if (!user) return res.status(404).json({ error: "Пользователь не найден", code: "USER_NOT_FOUND" })

    const existingSub = getAddonSubscription(userId, addonKey)
    let customerId = existingSub?.stripe_customer_id || undefined

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        name: user.username,
        metadata: { userId: String(userId) },
      })
      customerId = customer.id
      upsertAddonSubscription(userId, addonKey, { stripe_customer_id: customerId })
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${FRONTEND_URL}/wallet?addonCheckout=success&addon=${addonKey}`,
      cancel_url: `${FRONTEND_URL}/wallet?addonCheckout=cancel`,
      metadata: { userId: String(userId), addonKey },
      subscription_data: {
        metadata: { userId: String(userId), addonKey },
      },
    })

    res.status(200).json({ mock: false, url: session.url, sessionId: session.id })
  } catch (err: any) {
    captureError("[addons/create-checkout] Stripe error:", err)
    res.status(500).json({ error: err.message || "Не удалось создать Stripe Checkout Session" })
  }
}))

/* ================================================================
   POST /addons/webhook
   Монтируется в server.ts с express.raw() ДО express.json() —
   аналогично /subscription/webhook.
   ================================================================ */
router.post("/webhook", async (req, res) => {
  if (!isStripeConfigured || !stripe) {
    return res.status(503).json({ error: "Stripe не настроен на сервере" })
  }
  if (!STRIPE_WEBHOOK_SECRET_ADDONS) {
    console.error("[addons/webhook] STRIPE_WEBHOOK_SECRET_ADDONS не задан — вебхук отклонён")
    return res.status(503).json({ error: "Webhook secret не настроен на сервере" })
  }

  const signature = req.headers["stripe-signature"] as string | undefined
  if (!signature) {
    return res.status(400).json({ error: "Отсутствует заголовок stripe-signature" })
  }

  let event: any
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, STRIPE_WEBHOOK_SECRET_ADDONS)
  } catch (err: any) {
    captureError("[addons/webhook] Signature verification failed:", err)
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
        const addonKey = session.metadata?.addonKey as AddonKey | undefined

        if (userId && isAddonKey(addonKey)) {
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

          upsertAddonSubscription(userId, addonKey, {
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
          ).run(userId, `Addon: ${addonKey}`, (session.amount_total ?? 0) / 100)
          logAudit(userId, "credit", (session.amount_total ?? 0) / 100, "addon_stripe_checkout", {
            addonKey,
            stripe_event_id: event.id,
          })
        }
        break
      }

      case "customer.subscription.updated": {
        const stripeSub = event.data.object
        const userId = Number(stripeSub.metadata?.userId)
        const priceId = stripeSub.items?.data?.[0]?.price?.id || null
        const addonKey = (stripeSub.metadata?.addonKey as AddonKey | undefined) || addonFromPriceId(priceId)

        if (userId && isAddonKey(addonKey)) {
          upsertAddonSubscription(userId, addonKey, {
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
        const addonKey = (stripeSub.metadata?.addonKey as AddonKey | undefined) || addonFromPriceId(priceId)

        if (userId && isAddonKey(addonKey)) {
          upsertAddonSubscription(userId, addonKey, {
            status: "canceled",
            cancel_at_period_end: 0,
            canceled_at: Date.now(),
          })
        }
        break
      }

      /* См. аналогичный обработчик в subscription.routes.ts — та же логика для addon-подписок. */
      case "invoice.payment_failed": {
        const invoice = event.data.object
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id

        const subRow = subscriptionId
          ? (db
              .prepare(`SELECT user_id, addon_key FROM addon_subscriptions WHERE stripe_subscription_id = ?`)
              .get(subscriptionId) as { user_id: number; addon_key: AddonKey } | undefined)
          : customerId
            ? (db
                .prepare(`SELECT user_id, addon_key FROM addon_subscriptions WHERE stripe_customer_id = ?`)
                .get(customerId) as { user_id: number; addon_key: AddonKey } | undefined)
            : undefined

        if (subRow) {
          db.prepare(
            `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text)
             VALUES (?, NULL, 'billing', 'addon_subscription', NULL, ?)`,
          ).run(
            subRow.user_id,
            `Не удалось списать оплату за addon «${subRow.addon_key}». Обновите способ оплаты — иначе доступ будет ограничен.`,
          )

          db.prepare(
            `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
             VALUES (?, 'subscription', ?, 'Stripe', ?, 'cash_usd', 'failed')`,
          ).run(subRow.user_id, `Addon: ${subRow.addon_key} — платёж отклонён`, (invoice.amount_due ?? 0) / 100)

          logAudit(subRow.user_id, "debit", 0, "addon_payment_failed", {
            addonKey: subRow.addon_key,
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
    captureError("[addons/webhook] Handler error:", err)
    res.status(500).json({ error: err.message || "Ошибка обработки webhook" })
  }
})

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
   POST /addons/cancel
   body: { addonKey: 'jarvis_premium' | 'walli_premium' }
   ================================================================ */
router.post("/cancel", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { addonKey } = req.body || {}
  if (!isAddonKey(addonKey)) {
    return res.status(400).json({
      error: `Некорректный addon-ключ. Допустимые значения: ${ADDON_KEYS.join(", ")}`,
    })
  }

  const userId = req.user!.userId
  const sub = getAddonSubscription(userId, addonKey)

  if (!sub || sub.status === "inactive" || sub.status === "canceled") {
    return res.status(400).json({ error: "У вас нет активной addon-подписки для отмены" })
  }

  try {
    if (isStripeConfigured && stripe && sub.stripe_subscription_id) {
      const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      upsertAddonSubscription(userId, addonKey, {
        cancel_at_period_end: updated.cancel_at_period_end ? 1 : 0,
        status: mapStripeStatus(updated.status),
      })
    } else {
      upsertAddonSubscription(userId, addonKey, { cancel_at_period_end: 1 })
    }

    res.json({
      success: true,
      subscription: serializeAddonSubscription(getAddonSubscription(userId, addonKey), addonKey),
      message: "Addon-подписка будет отменена в конце оплаченного периода.",
    })
  } catch (err: any) {
    captureError("[addons/cancel] error:", err)
    res.status(500).json({ error: err.message || "Не удалось отменить addon-подписку" })
  }
}))

export default router
