import crypto from "node:crypto"
import db from "../lib/db"

/* ================================================================
   OSGARD · Webhook Trigger — сервис управления триггерами
   ----------------------------------------------------------------
   Один узел webhook_trigger в графе цепочки = одна запись здесь
   (chain_id, node_id). token — единственный секрет: непредсказуемый,
   уникальный, используется как есть в публичном URL /wh/:token —
   отдельной схемы подписи не требуется (см. Phase 2 ТЗ).
   ================================================================ */

export interface WebhookTriggerRow {
  id: number
  chain_id: number
  node_id: string
  user_id: number
  token: string
  enabled: number
  last_triggered_at: number | null
  trigger_count: number
  created_at: number
  updated_at: number
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("hex")
}

export function getWebhookTrigger(userId: number, chainId: number, nodeId: string): WebhookTriggerRow | undefined {
  return db
    .prepare(`SELECT * FROM orchestrator_webhook_triggers WHERE user_id = ? AND chain_id = ? AND node_id = ?`)
    .get(userId, chainId, nodeId) as WebhookTriggerRow | undefined
}

export function getWebhookTriggerByToken(token: string): WebhookTriggerRow | undefined {
  return db.prepare(`SELECT * FROM orchestrator_webhook_triggers WHERE token = ?`).get(token) as WebhookTriggerRow | undefined
}

/** Создаёт триггер узла (если ещё нет) или перевыпускает token (если уже существует). */
export function createOrRegenerateWebhookTrigger(userId: number, chainId: number, nodeId: string): WebhookTriggerRow {
  const existing = getWebhookTrigger(userId, chainId, nodeId)
  const now = Date.now()

  if (!existing) {
    const token = generateToken()
    const result = db
      .prepare(
        `INSERT INTO orchestrator_webhook_triggers (chain_id, node_id, user_id, token, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(chainId, nodeId, userId, token, now, now)
    return getWebhookTrigger(userId, chainId, nodeId) ?? { id: Number(result.lastInsertRowid) } as WebhookTriggerRow
  }

  const token = generateToken()
  db.prepare(`UPDATE orchestrator_webhook_triggers SET token = ?, enabled = 1, updated_at = ? WHERE id = ?`).run(token, now, existing.id)
  return getWebhookTrigger(userId, chainId, nodeId)!
}

export function deleteWebhookTrigger(userId: number, chainId: number, nodeId: string): boolean {
  const result = db
    .prepare(`DELETE FROM orchestrator_webhook_triggers WHERE user_id = ? AND chain_id = ? AND node_id = ?`)
    .run(userId, chainId, nodeId)
  return result.changes > 0
}

export function recordWebhookTrigger(id: number): void {
  db.prepare(
    `UPDATE orchestrator_webhook_triggers SET last_triggered_at = ?, trigger_count = trigger_count + 1 WHERE id = ?`,
  ).run(Date.now(), id)
}
