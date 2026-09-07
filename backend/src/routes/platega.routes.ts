import { Response, Router } from "express"
import db from "../lib/db"
import { FRONTEND_URL, PlanKey } from "../lib/stripe"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { rateLimit } from "../middleware/rateLimiter"
import { asyncHandler } from "../utils/async-handler"
import { logAudit } from "../lib/audit"
import { upsertSubscription } from "./subscription.routes"
import { createPlategaPayment, getPlategaPayment, isPlategaConfigured, isPlategaPaid, PLATEGA_PLAN_PRICES_RUB } from "../lib/platega"

const router = Router()
const PAID_PLANS: Exclude<PlanKey, "free">[] = ["pro", "supreme", "duo", "elite"]
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000

// Public capability check: expose availability, never merchant credentials.
router.get("/status", (_req, res) => {
  res.json({ available: isPlategaConfigured })
})

router.post("/create-payment", rateLimit(60_000, 10), requireAuth, asyncHandler(async (req: AuthRequest, res: Response) => {
  const plan = req.body?.plan as PlanKey | undefined
  if (!plan || !PAID_PLANS.includes(plan as Exclude<PlanKey, "free">)) return res.status(400).json({ error: "Invalid plan" })
  if (!isPlategaConfigured) return res.status(503).json({ error: "Platega payment is temporarily unavailable" })
  const amountRub = PLATEGA_PLAN_PRICES_RUB[plan as Exclude<PlanKey, "free">]
  const payment = await createPlategaPayment({
    amountRub,
    description: `OSGARD ${plan} subscription for 30 days`,
    returnUrl: `${FRONTEND_URL}/wallet?checkout=success&plan=${plan}&provider=platega`,
    failedUrl: `${FRONTEND_URL}/pricing?checkout=cancel&provider=platega`,
    metadata: { userId: String(req.user!.userId), plan },
  })
  if (!payment.transactionId || !payment.redirect) return res.status(502).json({ error: "Platega did not return a payment URL" })
  const now = Date.now()
  db.prepare(`INSERT INTO platega_payments (id, user_id, plan, amount_rub, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(payment.transactionId, req.user!.userId, plan, amountRub, payment.status || "pending", now, now)
  res.json({ url: payment.redirect, paymentId: payment.transactionId })
}))

router.post("/webhook", asyncHandler(async (req, res) => {
  const transactionId = req.body?.transactionId || req.body?.id
  if (typeof transactionId !== "string" || transactionId.length > 128) return res.status(400).json({ error: "Missing transactionId" })
  if (!isPlategaConfigured) return res.status(503).json({ error: "Platega is not configured" })
  const remote = await getPlategaPayment(transactionId)
  if (!isPlategaPaid(remote.status)) {
    db.prepare(`UPDATE platega_payments SET status = ?, updated_at = ? WHERE id = ?`).run(remote.status || "pending", Date.now(), transactionId)
    return res.json({ received: true })
  }
  const payment = db.prepare(`SELECT user_id, plan, amount_rub, status FROM platega_payments WHERE id = ?`).get(transactionId) as { user_id: number; plan: PlanKey; amount_rub: number; status: string } | undefined
  if (!payment) return res.status(404).json({ error: "Unknown payment" })
  if (remote.paymentDetails?.currency !== "RUB" || Number(remote.paymentDetails?.amount) !== payment.amount_rub) {
    return res.status(400).json({ error: "Payment amount or currency does not match" })
  }
  const claimed = db.prepare(`UPDATE platega_payments SET status = 'succeeded', updated_at = ? WHERE id = ? AND status != 'succeeded'`).run(Date.now(), transactionId)
  if (!claimed.changes) return res.json({ received: true, duplicate: true })
  const now = Date.now()
  upsertSubscription(payment.user_id, { plan: payment.plan, status: "active", current_period_start: now, current_period_end: now + PERIOD_MS, cancel_at_period_end: 0, canceled_at: null })
  db.prepare(`INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status) VALUES (?, 'subscription', ?, 'Platega', ?, 'rub', 'done')`).run(payment.user_id, `Subscription ${payment.plan} (Platega)`, payment.amount_rub)
  logAudit(payment.user_id, "credit", payment.amount_rub, "subscription_platega_paid", { transactionId, plan: payment.plan })
  res.json({ received: true, activated: true })
}))

export default router
