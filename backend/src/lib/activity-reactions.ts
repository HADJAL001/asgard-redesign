import db from "./db"

/* ================================================================
   OSGARD · Реакции («огоньки») — общая логика для ленты и Зала Славы
   ----------------------------------------------------------------
   Toggle всегда идемпотентен: повторный вызов "поставить" от того же
   пользователя не создаёт дубль (UNIQUE в схеме, миграция 111), а
   повторный вызов "снять" на уже снятой реакции — просто no-op.
   ================================================================ */

export type ReactionEntityType = "activity_event" | "hall_of_fame"

export function reactionCount(entityType: ReactionEntityType, entityId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM activity_reactions WHERE entity_type = ? AND entity_id = ?`)
    .get(entityType, entityId) as { n: number }
  return row.n
}

export function hasReacted(entityType: ReactionEntityType, entityId: number, userId: number): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM activity_reactions WHERE entity_type = ? AND entity_id = ? AND user_id = ? LIMIT 1`,
    )
    .get(entityType, entityId, userId)
  return Boolean(row)
}

/** Возвращает итоговое состояние после переключения: liked=true — реакция
 *  теперь стоит, liked=false — снята. UNIQUE-индекс страхует от гонки двух
 *  параллельных кликов от одного пользователя на уровне схемы. */
export function toggleReaction(
  entityType: ReactionEntityType,
  entityId: number,
  userId: number,
): { liked: boolean; count: number } {
  const existing = hasReacted(entityType, entityId, userId)
  if (existing) {
    db.prepare(
      `DELETE FROM activity_reactions WHERE entity_type = ? AND entity_id = ? AND user_id = ?`,
    ).run(entityType, entityId, userId)
  } else {
    db.prepare(
      `INSERT INTO activity_reactions (entity_type, entity_id, user_id) VALUES (?, ?, ?)
       ON CONFLICT(entity_type, entity_id, user_id) DO NOTHING`,
    ).run(entityType, entityId, userId)
  }
  return { liked: !existing, count: reactionCount(entityType, entityId) }
}

/** Пакетно считает реакции для списка id — избегает N+1 при рендере ленты. */
export function reactionCountsFor(
  entityType: ReactionEntityType,
  entityIds: number[],
): Map<number, number> {
  const map = new Map<number, number>()
  if (entityIds.length === 0) return map
  const placeholders = entityIds.map(() => "?").join(", ")
  const rows = db
    .prepare(
      `SELECT entity_id AS entityId, COUNT(*) AS n FROM activity_reactions
       WHERE entity_type = ? AND entity_id IN (${placeholders})
       GROUP BY entity_id`,
    )
    .all(entityType, ...entityIds) as Array<{ entityId: number; n: number }>
  for (const row of rows) map.set(row.entityId, row.n)
  return map
}

/** Какие из entityIds пользователь уже лайкнул — для рендера "нажатой" кнопки. */
export function reactedByUser(
  entityType: ReactionEntityType,
  entityIds: number[],
  userId: number | null,
): Set<number> {
  const set = new Set<number>()
  if (!userId || entityIds.length === 0) return set
  const placeholders = entityIds.map(() => "?").join(", ")
  const rows = db
    .prepare(
      `SELECT entity_id AS entityId FROM activity_reactions
       WHERE entity_type = ? AND user_id = ? AND entity_id IN (${placeholders})`,
    )
    .all(entityType, userId, ...entityIds) as Array<{ entityId: number }>
  for (const row of rows) set.add(row.entityId)
  return set
}

/** Топ-1 недели по реакциям в Зале Славы — для награды "бесплатный Elite".
 *  Считается только по завершённой (прошлой) неделе, не по текущей, чтобы
 *  результат нельзя было изменить реакцией уже после объявления победителя. */
export function weeklyTopHallOfFame(sinceMs: number, untilMs: number, limit = 1) {
  return db
    .prepare(
      `SELECT h.id, h.artifact_name AS artifactName, h.architect, h.price,
              COUNT(r.id) AS reactionCount
       FROM hall_of_fame h
       JOIN activity_reactions r
         ON r.entity_type = 'hall_of_fame' AND r.entity_id = h.id
        AND r.created_at >= ? AND r.created_at < ?
       GROUP BY h.id
       ORDER BY reactionCount DESC, h.price DESC
       LIMIT ?`,
    )
    .all(sinceMs, untilMs, limit) as Array<{
    id: number
    artifactName: string
    architect: string
    price: number
    reactionCount: number
  }>
}
