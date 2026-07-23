import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 065: таблица activity_events
   ----------------------------------------------------------------
   Глобальная публичная лента активности платформы (крафт артефактов,
   продажи на маркете, попадание в Зал Славы) — в отличие от
   notifications (адресные, есть получатель user_id), здесь user_id —
   это только автор события, записи публичные и общие для всех.
   ================================================================ */

export function runActivityFeedMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        text TEXT NOT NULL,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
  } catch (e: any) {
    console.warn(`[migration:065] Skipping activity_events table: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_activity_events_created ON activity_events(created_at DESC, id DESC)`)
  } catch (e: any) {
    console.warn(`[migration:065] Skipping idx_activity_events_created: ${e.message}`)
  }
}

if (require.main === module) {
  runActivityFeedMigration()
}
