import Stripe from "stripe"
import dotenv from "dotenv"

dotenv.config()

/* ================================================================
   OSGARD STRIPE CLIENT
   ================================================================
   Ленивая инициализация Stripe SDK.

   Если STRIPE_SECRET_KEY не задан в .env (dev-среда без реальных
   ключей Stripe) — экспортируем stripe = null, и все роуты
   subscription.routes.ts переключаются в "mock"-режим: подписки
   активируются локально в БД без обращения к Stripe API.
   ================================================================ */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ""

/* В проде боевой трафик не должен случайно уйти в Stripe test-mode (sk_test_...) —
   ошибка в .env иначе тихо создавала бы реальным пользователям тестовые платежи,
   которые никогда не спишутся. Падаем при старте, а не молча продолжаем. */
if (process.env.NODE_ENV === "production" && STRIPE_SECRET_KEY && !STRIPE_SECRET_KEY.startsWith("sk_live_")) {
  throw new Error(
    "STRIPE_SECRET_KEY в production должен быть боевым ключом (sk_live_...), получен тестовый/невалидный ключ. См. docs/stripe-live-checklist.md"
  )
}

export const stripe: Stripe | null = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-08-27.basil" as any })
  : null

export const isStripeConfigured = !!stripe

/* Два разных Stripe webhook endpoint-а (/subscription/webhook и /addons/webhook)
   регистрируются в Stripe Dashboard как отдельные URL — у каждого свой уникальный
   signing secret. STRIPE_WEBHOOK_SECRET_ADDONS опционален и с фолбэком на общий
   STRIPE_WEBHOOK_SECRET (для совместимости, если исторически был настроен только
   один endpoint), но в боевом режиме должен быть задан отдельно — см.
   docs/stripe-live-checklist.md. */
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ""
export const STRIPE_WEBHOOK_SECRET_ADDONS = process.env.STRIPE_WEBHOOK_SECRET_ADDONS || STRIPE_WEBHOOK_SECRET

export type PlanKey = "free" | "pro" | "supreme" | "duo" | "elite"

/* Соответствие плана и его Stripe Price ID (задаются в .env) */
export const PLAN_PRICE_IDS: Record<Exclude<PlanKey, "free">, string> = {
  pro: process.env.STRIPE_PRICE_PRO || "",
  supreme: process.env.STRIPE_PRICE_SUPREME || "",
  duo: process.env.STRIPE_PRICE_DUO || "",
  elite: process.env.STRIPE_PRICE_ELITE || "",
}

/* Стоимость планов в USD (для справки и mock-режима) */
export const PLAN_PRICES_USD: Record<PlanKey, number> = {
  free: 0,
  pro: 29,
  supreme: 99,
  duo: 149,
  elite: 199,
}

/* Иерархия планов — используется в requirePlan для сравнения уровней доступа */
export const PLAN_ORDER: PlanKey[] = ["free", "pro", "supreme", "duo", "elite"]

export function planLevel(plan: string): number {
  const idx = PLAN_ORDER.indexOf(plan as PlanKey)
  return idx === -1 ? 0 : idx
}

export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"

export default stripe
