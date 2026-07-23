import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 063: таблица notifications
   ----------------------------------------------------------------
   Реальный бэкенд для вкладки «Уведомления» (ранее полностью моковой,
   см. components/notifications-view.tsx) — лайки/комментарии к постам
   community и другие событийные оповещения пользователя.
   ================================================================ */

export function runNotificationsMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        actor_id INTEGER,
        type TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        text TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `)
  } catch (e: any) {
    console.warn(`[migration:063] Skipping notifications table: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`)
  } catch (e: any) {
    console.warn(`[migration:063] Skipping idx_notifications_user_created: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read)`)
  } catch (e: any) {
    console.warn(`[migration:063] Skipping idx_notifications_user_unread: ${e.message}`)
  }
}

if (require.main === module) {
  runNotificationsMigration()
}
