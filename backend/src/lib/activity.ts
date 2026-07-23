import db from "./db"

export type ActivityType = "artifact_crafted" | "artifact_sold" | "hof_entry"

/** Записывает публичное событие в глобальную ленту активности. */
export function createActivityEvent(params: {
  userId: number
  type: ActivityType
  entityType: string
  entityId: number
  text: string
  metadata?: Record<string, unknown>
}) {
  const { userId, type, entityType, entityId, text, metadata } = params

  db.prepare(
    `INSERT INTO activity_events (user_id, type, entity_type, entity_id, text, metadata) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, type, entityType, entityId, text, metadata ? JSON.stringify(metadata) : null)
}
