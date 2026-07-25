import { Response, NextFunction } from "express"
import db from "./db"
import { AuthRequest } from "../middleware/authMiddleware"

/* ================================================================
   OSGARD ACADEMY — «Founders Program» (платный курс + сертификация)
   ================================================================
   Отдельный вертикальный саб, независимый от основных тарифов
   (lib/stripe.ts PlanKey) и от jarvis/walli-аддонов (lib/addons.ts).

   В ОТЛИЧИЕ от аддонов, здесь ЕСТЬ иерархия тиров:
     founder_track  <  founder_circle
   Активный founder_circle удовлетворяет requireEnrollment('founder_track').

   Цены и Stripe Price ID — параметры (env), не хардкод в логике.
   Продукт включается фичефлагом ACADEMY_ENABLED (по умолчанию OFF →
   поведение прода не меняется: checkout отдаёт 503, витрина скрыта).
   ================================================================ */

export type AcademyTier = "founder_track" | "founder_circle"

export const ACADEMY_TIERS: AcademyTier[] = ["founder_track", "founder_circle"]

/* Иерархия тиров — индекс = уровень доступа (выше = больше прав) */
export const ACADEMY_TIER_ORDER: AcademyTier[] = ["founder_track", "founder_circle"]

export function academyTierLevel(tier: string): number {
  const idx = ACADEMY_TIER_ORDER.indexOf(tier as AcademyTier)
  return idx === -1 ? -1 : idx
}

/* Соответствие тира и его Stripe Price ID (задаются в .env) */
export const ACADEMY_PRICE_IDS: Record<AcademyTier, string> = {
  founder_track: process.env.STRIPE_PRICE_FOUNDER_TRACK || "",
  founder_circle: process.env.STRIPE_PRICE_FOUNDER_CIRCLE || "",
}

/* Стоимость тиров в USD/мес (справочно и для mock-режима) */
export const ACADEMY_PRICES_USD: Record<AcademyTier, number> = {
  founder_track: 99,
  founder_circle: 990,
}

export function isAcademyTier(value: unknown): value is AcademyTier {
  return typeof value === "string" && (ACADEMY_TIERS as string[]).includes(value)
}

export function academyTierFromPriceId(priceId: string | null | undefined): AcademyTier | null {
  if (!priceId) return null
  for (const tier of ACADEMY_TIERS) {
    if (ACADEMY_PRICE_IDS[tier] && ACADEMY_PRICE_IDS[tier] === priceId) return tier
  }
  return null
}

/* Продукт включён? Единый источник правды для роутов и /academy/config. */
export function isAcademyEnabled(): boolean {
  return process.env.ACADEMY_ENABLED === "true"
}

export type AcademyEnrollmentRow = {
  id: number
  user_id: number
  tier: AcademyTier
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

export function getEnrollment(userId: number): AcademyEnrollmentRow | undefined {
  return db
    .prepare(`SELECT * FROM academy_enrollments WHERE user_id = ?`)
    .get(userId) as AcademyEnrollmentRow | undefined
}

export function upsertEnrollment(userId: number, fields: Partial<AcademyEnrollmentRow>) {
  const existing = getEnrollment(userId)
  const now = Date.now()

  if (!existing) {
    db.prepare(
      `INSERT INTO academy_enrollments (
        user_id, tier, status, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        current_period_start, current_period_end, cancel_at_period_end, canceled_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      fields.tier ?? "founder_track",
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
      `UPDATE academy_enrollments SET
        tier = ?, status = ?, stripe_customer_id = ?, stripe_subscription_id = ?, stripe_price_id = ?,
        current_period_start = ?, current_period_end = ?, cancel_at_period_end = ?, canceled_at = ?,
        updated_at = ?
       WHERE user_id = ?`,
    ).run(
      fields.tier ?? existing.tier,
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
    )
  }
}

export function serializeEnrollment(sub: AcademyEnrollmentRow | undefined) {
  if (!sub) {
    return {
      tier: null,
      status: "inactive",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
    }
  }
  return {
    tier: sub.tier,
    status: sub.status,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    canceledAt: sub.canceled_at,
  }
}

/* Активная запись + (опц.) минимальный тир. founder_circle покрывает track. */
export function hasActiveEnrollment(userId: number, minTier: AcademyTier = "founder_track"): boolean {
  const sub = getEnrollment(userId)
  const status = sub?.status ?? "inactive"
  const active = status === "active" || status === "trialing"
  if (!active || !sub) return false
  return academyTierLevel(sub.tier) >= academyTierLevel(minTier)
}

/* ================================================================
   requireEnrollment(minTier) — middleware проверки активной записи
   в программе на нужном тире (иерархично: circle ⊇ track).
   ================================================================ */
export function requireEnrollment(minTier: AcademyTier = "founder_track") {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Требуется авторизация" })
    }
    if (!hasActiveEnrollment(req.user.userId, minTier)) {
      return res.status(403).json({
        error: `Требуется активная запись в программу (тир: ${minTier} или выше).`,
        requiredTier: minTier,
      })
    }
    next()
  }
}
