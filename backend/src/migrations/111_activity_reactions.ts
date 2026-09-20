import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 111: activity_reactions
   ----------------------------------------------------------------
   Реакции («огоньки») на события ленты (activity_events) и на записи
   Зала Славы (hall_of_fame). Одна таблица на обе сущности, различаются
   по entity_type — не заводим вторую почти идентичную таблицу.

   Антифрод: UNIQUE(entity_type, entity_id, user_id) — повторный лайк
   тем же пользователем невозможен на уровне схемы, а не только в коде
   роута (toggle всегда идемпотентен). Rate-limit по частоте — в роуте.
   ================================================================ */

export function runActivityReactionsMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('activity_event', 'hall_of_fame')),
        entity_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
        UNIQUE(entity_type, entity_id, user_id)
      )
    `)
  } catch (e: any) {
    console.warn(`[migration:111] Skipping activity_reactions table: ${e.message}`)
  }
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_activity_reactions_entity ON activity_reactions(entity_type, entity_id)`,
    )
  } catch (e: any) {
    console.warn(`[migration:111] Skipping idx_activity_reactions_entity: ${e.message}`)
  }
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_activity_reactions_user_created ON activity_reactions(user_id, created_at DESC)`,
    )
  } catch (e: any) {
    console.warn(`[migration:111] Skipping idx_activity_reactions_user_created: ${e.message}`)
  }
}

if (require.main === module) {
  runActivityReactionsMigration()
}
