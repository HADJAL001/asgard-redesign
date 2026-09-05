import { PlanKey } from "./stripe"

const API_BASE = (process.env.PLATEGA_API_BASE_URL || "https://app.platega.io").replace(/\/$/, "")
const MERCHANT_ID = process.env.PLATEGA_MERCHANT_ID || ""
const SECRET = process.env.PLATEGA_API_KEY || ""

export const isPlategaConfigured = Boolean(MERCHANT_ID && SECRET)

export const PLATEGA_PLAN_PRICES_RUB: Record<Exclude<PlanKey, "free">, number> = {
  pro: Number(process.env.PLATEGA_PRICE_PRO) || 2900,
  supreme: Number(process.env.PLATEGA_PRICE_SUPREME) || 9900,
  duo: Number(process.env.PLATEGA_PRICE_DUO) || 14900,
  elite: Number(process.env.PLATEGA_PRICE_ELITE) || 19900,
}

type PlategaTransaction = {
  transactionId: string
  redirect?: string
  status?: string
  paymentDetails?: { amount?: number; currency?: string }
}

function headers() {
  return { "Content-Type": "application/json", "X-MerchantId": MERCHANT_ID, "X-Secret": SECRET }
}

export async function createPlategaPayment(params: {
  amountRub: number
  description: string
  returnUrl: string
  failedUrl: string
  metadata: Record<string, string>
}): Promise<PlategaTransaction> {
  if (!isPlategaConfigured) throw new Error("Platega is not configured")
  const response = await fetch(`${API_BASE}/v2/transaction/process`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      paymentDetails: { amount: params.amountRub, currency: "RUB" },
      description: params.description.slice(0, 250),
      return: params.returnUrl,
      failedUrl: params.failedUrl,
      metadata: params.metadata,
    }),
  })
  if (!response.ok) throw new Error(`Platega API ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json() as Promise<PlategaTransaction>
}

export async function getPlategaPayment(transactionId: string): Promise<PlategaTransaction> {
  if (!isPlategaConfigured) throw new Error("Platega is not configured")
  const response = await fetch(`${API_BASE}/transaction/${encodeURIComponent(transactionId)}`, { headers: headers() })
  if (!response.ok) throw new Error(`Platega API ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json() as Promise<PlategaTransaction>
}

export function isPlategaPaid(status?: string) {
  return status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED"
}
