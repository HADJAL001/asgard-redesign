import type { FileTree } from "../../types/file-tree"

/* ================================================================
   OSGARD · Stripe Integration Codegen
   ----------------------------------------------------------------
   НЕ вызывает Stripe API и не создаёт реальные Product/Price — это
   отдельный billing платформы OSGARD (см. backend/src/lib/stripe.ts).
   Здесь генерируются файлы Stripe Checkout, которые встраиваются
   ВНУТРЬ сгенерированного пользователем Next.js-приложения (тот же
   FileTree, что возвращает app-generator.ts).

   Пример вызова:
     const files = createStripeIntegration({ productName: "Pro Plan", priceUsd: 19 })
     // -> [{ path: "lib/stripe.ts", content: ... }, { path: "app/api/checkout/route.ts", ... }, ...]
   ================================================================ */

export type StripeIntegrationOptions = {
  productName: string
  priceUsd: number
  mode?: "payment" | "subscription"
  successPath?: string
  cancelPath?: string
}

export function createStripeIntegration(options: StripeIntegrationOptions): FileTree {
  const { productName, priceUsd, mode = "payment", successPath = "/success", cancelPath = "/cancel" } = options

  const libStripe = `import Stripe from "stripe"

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  throw new Error("STRIPE_SECRET_KEY не задан в .env.local")
}

export const stripe = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" })
`

  const checkoutRoute = `import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"

export async function POST(request: Request) {
  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? ""

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "${mode}",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: ${Math.round(priceUsd * 100)},
            product_data: { name: ${JSON.stringify(productName)} },
            ${mode === "subscription" ? 'recurring: { interval: "month" },' : ""}
          },
          quantity: 1,
        },
      ],
      success_url: \`\${origin}${successPath}?session_id={CHECKOUT_SESSION_ID}\`,
      cancel_url: \`\${origin}${cancelPath}\`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error("[checkout] failed:", err)
    return NextResponse.json({ error: "Не удалось создать сессию оплаты" }, { status: 500 })
  }
}
`

  const webhookRoute = `import { NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ""

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get("stripe-signature") ?? ""

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error("[stripe-webhook] invalid signature:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  switch (event.type) {
    case "checkout.session.completed":
      // TODO: активировать доступ/заказ по event.data.object
      break
    default:
      break
  }

  return NextResponse.json({ received: true })
}
`

  const checkoutButton = `"use client"

import { useState } from "react"

export function CheckoutButton() {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch("/api/checkout", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={handleClick} disabled={loading}>
      {loading ? "Загрузка..." : "Оплатить ${productName} — $${priceUsd}"}
    </button>
  )
}
`

  const envExample = `STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
`

  return [
    { path: "lib/stripe.ts", content: libStripe },
    { path: "app/api/checkout/route.ts", content: checkoutRoute },
    { path: "app/api/stripe/webhook/route.ts", content: webhookRoute },
    { path: "components/CheckoutButton.tsx", content: checkoutButton },
    { path: ".env.local.example", content: envExample },
  ]
}
