import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 066: таблица analytics_events
   ----------------------------------------------------------------
   Универсальный журнал продуктовых событий (сейчас — конверсия
   paywall/pricing: pricing_view/pricing_click/pricing_conversion/
   pricing_abandon). user_id nullable — гости тоже шлют события
   через optionalAuth. session_id — id анонимной сессии на клиенте
   (localStorage), используется для склейки anonymous → registered
   и для атрибуции конверсии из Stripe webhook обратно к визиту.
   ================================================================ */

export function runAnalyticsEventsMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        session_id TEXT NOT NULL,
        event_name TEXT NOT NULL,
        meta TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `)
  } catch (e: any) {
    console.warn(`[migration:066] Skipping analytics_events table: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created ON analytics_events(event_name, created_at DESC)`)
  } catch (e: any) {
    console.warn(`[migration:066] Skipping idx_analytics_events_name_created: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id)`)
  } catch (e: any) {
    console.warn(`[migration:066] Skipping idx_analytics_events_session: ${e.message}`)
  }
}

if (require.main === module) {
  runAnalyticsEventsMigration()
}
