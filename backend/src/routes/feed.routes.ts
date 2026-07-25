import { Router } from "express"
import db from "../lib/db"

const router = Router()

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

type ActorRow = {
  id: number
  username: string
  display_name: string | null
  avatar_url: string | null
}

function mapActor(row: ActorRow) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarUrl: row.avatar_url || null,
  }
}

/* ---------------- GET /feed ---------------- */
router.get("/", (req, res) => {
  const before = Number(req.query.before)
  const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)

  const hasCursor = Number.isInteger(before) && before > 0

  const rows = db
    .prepare(
      `SELECT e.id, e.type, e.entity_type, e.entity_id, e.text, e.metadata, e.created_at,
              u.id as actor_id, u.username as actor_username, u.display_name as actor_display_name, u.avatar_url as actor_avatar_url
       FROM activity_events e
       JOIN users u ON u.id = e.user_id
       ${hasCursor ? "WHERE e.id < ?" : ""}
       ORDER BY e.id DESC
       LIMIT ?`,
    )
    .all(...(hasCursor ? [before, limit] : [limit])) as any[]

  const events = rows.map((r) => ({
    id: r.id,
    type: r.type,
    entityType: r.entity_type,
    entityId: r.entity_id,
    text: r.text,
    metadata: r.metadata ? JSON.parse(r.metadata) : null,
    createdAt: r.created_at,
    actor: mapActor({
      id: r.actor_id,
      username: r.actor_username,
      display_name: r.actor_display_name,
      avatar_url: r.actor_avatar_url,
    }),
  }))

  const nextCursor = events.length === limit ? events[events.length - 1].id : null

  res.json({ success: true, events, nextCursor })
})

/* ---------------- GET /feed/pulse ----------------
   Амбиентные агрегаты «живой вселенной» поверх той же таблицы activity_events
   (индекс created_at). Только чтение, дёшево, без новой миграции. Честные нули
   при отсутствии данных — никакого фейка: пусто → «тихо», а не выдуманные цифры.
   Фронт опрашивает это раз в ~20с (см. live-pulse-bar). */
router.get("/pulse", (_req, res) => {
  const forged24h = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM activity_events
         WHERE type = 'artifact_crafted' AND created_at >= datetime('now','-24 hours')`,
      )
      .get() as { n: number }
  ).n

  // «Активно сейчас» — честное окно недавней активности (15 мин), не «онлайн»-фейк.
  const activeNow = (
    db
      .prepare(
        `SELECT COUNT(DISTINCT user_id) as n FROM activity_events
         WHERE created_at >= datetime('now','-15 minutes')`,
      )
      .get() as { n: number }
  ).n

  const events24h = (
    db
      .prepare(
        `SELECT COUNT(*) as n FROM activity_events
         WHERE created_at >= datetime('now','-24 hours')`,
      )
      .get() as { n: number }
  ).n

  // Редчайший дроп за сутки: ранжируем по metadata.rarity (JSON1), берём топ.
  const rarestRow = db
    .prepare(
      `SELECT e.id, e.metadata, e.created_at,
              u.username, u.display_name,
              CASE json_extract(e.metadata,'$.rarity')
                WHEN 'mythic' THEN 5 WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3
                WHEN 'rare' THEN 2 WHEN 'common' THEN 1 ELSE 0 END as rank
       FROM activity_events e
       JOIN users u ON u.id = e.user_id
       WHERE e.type = 'artifact_crafted' AND e.created_at >= datetime('now','-24 hours')
       ORDER BY rank DESC, e.id DESC
       LIMIT 1`,
    )
    .get() as
    | { id: number; metadata: string | null; created_at: string; username: string; display_name: string | null; rank: number }
    | undefined

  let rarest: { name: string | null; rarity: string | null; actor: string; createdAt: string } | null = null
  if (rarestRow && rarestRow.rank > 0) {
    const meta = rarestRow.metadata ? (JSON.parse(rarestRow.metadata) as { name?: string; rarity?: string }) : {}
    rarest = {
      name: meta.name ?? null,
      rarity: meta.rarity ?? null,
      actor: rarestRow.display_name || rarestRow.username,
      createdAt: rarestRow.created_at,
    }
  }

  res.json({
    success: true,
    pulse: { forged24h, activeNow, events24h, rarest, at: new Date().toISOString() },
  })
})

export default router
