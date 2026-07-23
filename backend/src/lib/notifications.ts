import db from "./db"

export type NotificationType = "like" | "comment"

/** Создаёт уведомление для user_id. Не уведомляет пользователя о его же действии. */
export function createNotification(params: {
  userId: number
  actorId: number
  type: NotificationType
  entityType: string
  entityId: number
  text: string
}) {
  const { userId, actorId, type, entityType, entityId, text } = params
  if (userId === actorId) return

  db.prepare(
    `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(userId, actorId, type, entityType, entityId, text)
}
