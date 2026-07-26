import { EventEmitter } from "node:events"
import db from "./db"

/* ================================================================
   OSGARD · Notifications — запись в БД + real-time push (SSE)
   ----------------------------------------------------------------
   createNotification() вставляет строку в таблицу notifications и
   СРАЗУ эмитит событие в notificationEvents — SSE-эндпоинт
   GET /notifications/stream (notifications.routes.ts) слушает его и
   мгновенно проталкивает уведомление подключённому клиенту, без
   ожидания следующего опроса. Опрос (fetchUnreadCount раз в 60с)
   остаётся резервным каналом на случай обрыва SSE.
   ================================================================ */

export type NotificationType =
  | "like"
  | "comment"
  | "generation_ready"
  | "generation_failed"
  | "architect"
  | "marketplace_sale"
  | "marketplace_royalty"
  | "auction_outbid"
  | "auction_won"
  | "auction_sold"

/** Единый шинный эмиттер уведомлений. Событие "notify" несёт { userId, notification }.
 *  Много SSE-подключений (по одному на активную вкладку) → поднимаем лимит слушателей. */
export const notificationEvents = new EventEmitter()
notificationEvents.setMaxListeners(0)

export type ClientNotification = {
  id: number
  type: string
  entityType: string | null
  entityId: number | null
  text: string
  read: boolean
  createdAt: string
  actor: {
    id: number
    username: string
    displayName: string
    avatarUrl: string | null
  } | null
}

type JoinedRow = {
  id: number
  type: string
  entity_type: string | null
  entity_id: number | null
  text: string
  read: number
  created_at: string
  actor_id: number | null
  actor_username: string | null
  actor_display_name: string | null
  actor_avatar_url: string | null
}

/** Приводит объединённую строку (notifications ⨝ users) к форме, которую ждёт клиент.
 *  Идентична форме из GET /notifications, чтобы REST и SSE отдавали одно и то же. */
export function mapNotificationRow(r: JoinedRow): ClientNotification {
  return {
    id: r.id,
    type: r.type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    text: r.text,
    read: !!r.read,
    createdAt: r.created_at,
    actor: r.actor_id
      ? {
          id: r.actor_id,
          username: r.actor_username || "",
          displayName: r.actor_display_name || r.actor_username || "",
          avatarUrl: r.actor_avatar_url || null,
        }
      : null,
  }
}

const SELECT_JOINED = `SELECT n.id, n.type, n.entity_type, n.entity_id, n.text, n.read, n.created_at,
          a.id as actor_id, a.username as actor_username, a.display_name as actor_display_name, a.avatar_url as actor_avatar_url
   FROM notifications n
   LEFT JOIN users a ON a.id = n.actor_id
   WHERE n.id = ?`

/** Число непрочитанных уведомлений пользователя — для бейджа и снапшота SSE. */
export function getUnreadCount(userId: number): number {
  const { c } = db
    .prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND read = 0`)
    .get(userId) as { c: number }
  return c
}

/**
 * Создаёт уведомление для user_id и проталкивает его подписчикам SSE в реальном времени.
 * Не уведомляет пользователя о его же действии (actorId === userId).
 * actorId необязателен: системные события (готовность генерации и т.п.) актора не имеют.
 */
export function createNotification(params: {
  userId: number
  actorId?: number | null
  type: NotificationType
  entityType?: string | null
  entityId?: number | null
  text: string
}) {
  const { userId, type, text } = params
  const actorId = params.actorId ?? null
  const entityType = params.entityType ?? null
  const entityId = params.entityId ?? null

  if (actorId !== null && actorId === userId) return

  const info = db
    .prepare(
      `INSERT INTO notifications (user_id, actor_id, type, entity_type, entity_id, text) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, actorId, type, entityType, entityId, text)

  // Читаем свежую строку (с created_at из БД и данными актора) и эмитим её слушателям SSE.
  try {
    const row = db.prepare(SELECT_JOINED).get(Number(info.lastInsertRowid)) as JoinedRow | undefined
    if (row) {
      notificationEvents.emit("notify", {
        userId,
        notification: mapNotificationRow(row),
        unreadCount: getUnreadCount(userId),
      })
    }
  } catch {
    /* эмит — best-effort: строка уже записана, опрос доставит её даже без push */
  }
}
