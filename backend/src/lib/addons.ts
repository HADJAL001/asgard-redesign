import { Response, NextFunction } from "express"
import db from "./db"
import { AuthRequest } from "../middleware/authMiddleware"

/* ================================================================
   OSGARD ADDONS — ДЖАРВИС / ВАЛЛИ Premium
   ================================================================
   Параллельная (НЕ иерархическая) система подписок на AI-продукты,
   независимая от основных тарифов (см. lib/stripe.ts PlanKey).

   Единственные покупаемые ключи — jarvis_premium и walli_premium,
   оба фиксированы по цене $99/мес, без скидок за одновременную
   покупку обоих. Статус 'elite' не продаётся — это прогресс-статус
   внутри addon_progress (см. lib/addonProgression.ts), заслуживаемый
   через XP при активной premium-подписке.
   ================================================================ */

export type AddonKey = "jarvis_premium" | "walli_premium"
export type AddonProduct = "jarvis" | "walli"

export const ADDON_KEYS: AddonKey[] = ["jarvis_premium", "walli_premium"]

export const ADDON_PRODUCT: Record<AddonKey, AddonProduct> = {
  jarvis_premium: "jarvis",
  walli_premium: "walli",
}

/* Соответствие addon-ключа и его Stripe Price ID (задаются в .env) */
export const ADDON_PRICE_IDS: Record<AddonKey, string> = {
  jarvis_premium: process.env.STRIPE_PRICE_JARVIS_PREMIUM || "",
  walli_premium: process.env.STRIPE_PRICE_WALLI_PREMIUM || "",
}

/* Стоимость addon-подписок в USD — обе фиксированы по $99, без скидок за бандл */
export const ADDON_PRICES_USD: Record<AddonKey, number> = {
  jarvis_premium: 99,
  walli_premium: 99,
}

export function addonFromPriceId(priceId: string | null | undefined): AddonKey | null {
  if (!priceId) return null
  for (const key of ADDON_KEYS) {
    if (ADDON_PRICE_IDS[key] && ADDON_PRICE_IDS[key] === priceId) return key
  }
  return null
}

export type AddonSubscriptionRow = {
  id: number
  user_id: number
  addon_key: AddonKey
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_price_id: string | null
  current_period_start: number | null
  current_period_end: number | null
  cancel_at_period_end: number
  canceled_at: number | null
  created_at: number
  updated_at: number
}

export function getAddonSubscription(userId: number, addonKey: AddonKey): AddonSubscriptionRow | undefined {
  return db
    .prepare(`SELECT * FROM addon_subscriptions WHERE user_id = ? AND addon_key = ?`)
    .get(userId, addonKey) as AddonSubscriptionRow | undefined
}

export function upsertAddonSubscription(
  userId: number,
  addonKey: AddonKey,
  fields: Partial<AddonSubscriptionRow>,
) {
  const existing = getAddonSubscription(userId, addonKey)
  const now = Date.now()

  if (!existing) {
    db.prepare(
      `INSERT INTO addon_subscriptions (
        user_id, addon_key, status, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        current_period_start, current_period_end, cancel_at_period_end, canceled_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      addonKey,
      fields.status ?? "inactive",
      fields.stripe_customer_id ?? null,
      fields.stripe_subscription_id ?? null,
      fields.stripe_price_id ?? null,
      fields.current_period_start ?? null,
      fields.current_period_end ?? null,
      fields.cancel_at_period_end ?? 0,
      fields.canceled_at ?? null,
      now,
      now,
    )
  } else {
    db.prepare(
      `UPDATE addon_subscriptions SET
        status = ?, stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?,
        current_period_start = ?, current_period_end = ?, cancel_at_period_end = ?, canceled_at = ?,
        updated_at = ?
       WHERE user_id = ? AND addon_key = ?`,
    ).run(
      fields.status ?? existing.status,
      fields.stripe_customer_id ?? existing.stripe_customer_id,
      fields.stripe_subscription_id ?? existing.stripe_subscription_id,
      fields.stripe_price_id ?? existing.stripe_price_id,
      fields.current_period_start ?? existing.current_period_start,
      fields.current_period_end ?? existing.current_period_end,
      fields.cancel_at_period_end ?? existing.cancel_at_period_end,
      fields.canceled_at ?? existing.canceled_at,
      now,
      userId,
      addonKey,
    )
  }
}

export function serializeAddonSubscription(sub: AddonSubscriptionRow | undefined, addonKey: AddonKey) {
  if (!sub) {
    return {
      addonKey,
      status: "inactive",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }
  }
  return {
    addonKey,
    status: sub.status,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    canceledAt: sub.canceled_at,
  }
}

export function hasActiveAddon(userId: number, addonKey: AddonKey): boolean {
  const sub = getAddonSubscription(userId, addonKey)
  const status = sub?.status ?? "inactive"
  return status === "active" || status === "trialing"
}

/* ================================================================
   requireAddon(addonKey) — middleware проверки активной addon-подписки.

   В отличие от requirePlan, здесь нет иерархии уровней: проверяется
   только status IN ('active', 'trialing') для конкретного addon_key.
   Бесплатный базовый доступ к продуктам ДЖАРВИС/ВАЛЛИ этим middleware
   не гейтится — им защищены только premium-функции (кастомизация,
   расширенное обучение и т.д.).
   ================================================================ */
export function requireAddon(addonKey: AddonKey) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Требуется авторизация" })
    }

    if (!hasActiveAddon(req.user.userId, addonKey)) {
      return res.status(403).json({
        error: `Требуется активная подписка: ${addonKey}.`,
        addonKey,
      })
    }

    next()
  }
}
