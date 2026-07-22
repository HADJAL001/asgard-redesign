import { test } from "node:test"
import assert from "node:assert/strict"
import { createStripeIntegration } from "../../services/integrations/stripe-codegen"

test("createStripeIntegration: возвращает ожидаемый набор файлов", () => {
  const files = createStripeIntegration({ productName: "Pro Plan", priceUsd: 19 })
  const paths = files.map((f) => f.path)

  assert.deepEqual(paths, [
    "lib/stripe.ts",
    "app/api/checkout/route.ts",
    "app/api/stripe/webhook/route.ts",
    "components/CheckoutButton.tsx",
    ".env.local.example",
  ])
})

test("createStripeIntegration: цена конвертируется в центы и mode=payment по умолчанию", () => {
  const files = createStripeIntegration({ productName: "Pro Plan", priceUsd: 19.5 })
  const checkoutRoute = files.find((f) => f.path === "app/api/checkout/route.ts")!

  assert.match(checkoutRoute.content, /unit_amount: 1950/)
  assert.match(checkoutRoute.content, /mode: "payment"/)
  assert.doesNotMatch(checkoutRoute.content, /recurring:/)
})

test("createStripeIntegration: mode=subscription добавляет recurring", () => {
  const files = createStripeIntegration({ productName: "Pro Plan", priceUsd: 9, mode: "subscription" })
  const checkoutRoute = files.find((f) => f.path === "app/api/checkout/route.ts")!

  assert.match(checkoutRoute.content, /mode: "subscription"/)
  assert.match(checkoutRoute.content, /recurring: \{ interval: "month" \}/)
})
