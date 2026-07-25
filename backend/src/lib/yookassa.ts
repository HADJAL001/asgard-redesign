import { randomUUID } from "crypto"
import dotenv from "dotenv"
import { PlanKey } from "./stripe"

dotenv.config()

/* ================================================================
   OSGARD · ЮKassa (YooKassa) — оплата из России
   ----------------------------------------------------------------
   Параллельный Stripe платёжный провайдер для РФ-карт (Мир/Visa/MC,
   выпущенные в РФ, SberPay, СБП и т.д. — способы оплаты выбираются
   на стороне ЮKassa).

   Ленивая конфигурация как у stripe.ts: без YOOKASSA_SHOP_ID/
   YOOKASSA_SECRET_KEY провайдер выключен (isYookassaConfigured=false),
   роуты уходят в mock/503 — так же, как Stripe без ключей.

   ЮKassa НЕ подписывает webhook HMAC-подписью (в отличие от Stripe).
   Поэтому уведомление НЕ доверяем по телу — а перезапрашиваем платёж
   по id через API (getYookassaPayment) и смотрим authoritative-статус.
   ================================================================ */

const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || ""
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || ""

/* В проде боевой трафик не должен случайно уйти в тестовый магазин ЮKassa
   (тестовый секретный ключ начинается с test_) — иначе реальные пользователи
   создавали бы тестовые платежи, которые никогда не спишутся. Падаем при
   старте, а не молча продолжаем (тот же принцип, что в lib/stripe.ts). */
if (process.env.NODE_ENV === "production" && YOOKASSA_SECRET_KEY && YOOKASSA_SECRET_KEY.startsWith("test_")) {
  throw new Error(
    "YOOKASSA_SECRET_KEY в production должен быть боевым ключом (live_...), получен тестовый (test_...). См. docs/yookassa-setup.md",
  )
}

export const isYookassaConfigured = !!(YOOKASSA_SHOP_ID && YOOKASSA_SECRET_KEY)

/* Ставка НДС для чека 54-ФЗ. По умолчанию 1 = «без НДС» (самозанятые/УСН).
   Список кодов: https://yookassa.ru/developers/api#create_payment_receipt_items_vat_code */
const YOOKASSA_VAT_CODE = Number(process.env.YOOKASSA_VAT_CODE) || 1

const API_BASE = "https://api.yookassa.ru/v3"

/* Цены планов в рублях/мес. Отдельно от PLAN_PRICES_USD: в РФ фиксируем
   рублёвый прайс, а не конвертируем по плавающему курсу (иначе цена скакала
   бы каждый день). Правится через env, если нужно. */
export const PLAN_PRICES_RUB: Record<Exclude<PlanKey, "free">, number> = {
  pro: Number(process.env.YOOKASSA_PRICE_PRO) || 2900,
  supreme: Number(process.env.YOOKASSA_PRICE_SUPREME) || 9900,
  duo: Number(process.env.YOOKASSA_PRICE_DUO) || 14900,
  elite: Number(process.env.YOOKASSA_PRICE_ELITE) || 19900,
}

function authHeader(): string {
  return "Basic " + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString("base64")
}

export type YookassaPayment = {
  id: string
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled"
  paid: boolean
  amount: { value: string; currency: string }
  confirmation?: { type: string; confirmation_url?: string }
  metadata?: Record<string, string>
  description?: string
}

/** Создаёт платёж и возвращает его вместе с confirmation_url для редиректа. */
export async function createYookassaPayment(params: {
  amountRub: number
  description: string
  returnUrl: string
  metadata: Record<string, string>
  /* Email покупателя для чека 54-ФЗ. Если у магазина подключена онлайн-касса,
     ЮKassa отклонит боевой платёж без чека — тогда email обязателен. */
  receiptEmail?: string
}): Promise<YookassaPayment> {
  if (!isYookassaConfigured) {
    throw new Error("ЮKassa не настроена (нет YOOKASSA_SHOP_ID/YOOKASSA_SECRET_KEY)")
  }

  const description = params.description.slice(0, 128)
  const amountValue = params.amountRub.toFixed(2)

  const body: Record<string, unknown> = {
    amount: { value: amountValue, currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: params.returnUrl },
    description,
    metadata: params.metadata,
  }

  /* Чек передаём только если есть email — иначе ЮKassa вернёт ошибку валидации
     receipt. Магазинам без онлайн-кассы чек не нужен, и мы его не шлём. */
  if (params.receiptEmail) {
    body.receipt = {
      customer: { email: params.receiptEmail },
      items: [
        {
          description,
          quantity: "1.00",
          amount: { value: amountValue, currency: "RUB" },
          vat_code: YOOKASSA_VAT_CODE,
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    }
  }

  const res = await fetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Idempotence-Key": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`ЮKassa API ${res.status}: ${text.slice(0, 300)}`)
  }

  return (await res.json()) as YookassaPayment
}

/** Перезапрашивает платёж по id — источник истины для верификации webhook. */
export async function getYookassaPayment(paymentId: string): Promise<YookassaPayment> {
  if (!isYookassaConfigured) {
    throw new Error("ЮKassa не настроена")
  }
  const res = await fetch(`${API_BASE}/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: authHeader() },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`ЮKassa API ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as YookassaPayment
}
