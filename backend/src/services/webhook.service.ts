import { createHmac } from "node:crypto"
import db from "../lib/db"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · Webhook-уведомления о завершении генерации проекта
   ----------------------------------------------------------------
   Рассылается ПОСЛЕ persist-а терминального статуса в ChainManager
   (completed/failed) — вызывается fire-and-forget, никогда не должна
   ронять сам pipeline или задерживать ответ пользователю. Каждый
   webhook — независимая best-effort доставка с таймаутом; ошибка
   одного получателя не влияет на остальных.
   ================================================================ */

const DELIVERY_TIMEOUT_MS = 10_000

export interface GenerationWebhookPayload {
  taskId: string
  status: "completed" | "failed"
  result?: any
  error?: string
}

interface WebhookRow {
  id: number
  url: string
  secret: string | null
}

export async function notifyGenerationComplete(userId: number, payload: GenerationWebhookPayload): Promise<void> {
  let webhooks: WebhookRow[]
  try {
    webhooks = db
      .prepare(`SELECT id, url, secret FROM webhooks WHERE user_id = ? AND enabled = 1`)
      .all(userId) as unknown as WebhookRow[]
  } catch (err) {
    captureError("[webhook] failed to load subscriptions:", err)
    return
  }

  if (webhooks.length === 0) return

  const body = JSON.stringify({ event: "generation." + payload.status, ...payload })

  await Promise.allSettled(
    webhooks.map(async (hook) => {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (hook.secret) {
        headers["X-Webhook-Signature"] = createHmac("sha256", hook.secret).update(body).digest("hex")
      }

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
      try {
        await fetch(hook.url, { method: "POST", headers, body, signal: controller.signal })
      } catch (err: any) {
        console.warn(`[webhook] delivery failed (id=${hook.id}):`, err?.message)
      } finally {
        clearTimeout(timeout)
      }
    }),
  )
}
