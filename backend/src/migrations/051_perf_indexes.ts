import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 051: недостающие индексы на горячих путях
   ----------------------------------------------------------------
   - artifacts(owner_id): коррелированный подзапрос на каждую строку
     лидерборда (leaderboard.routes.ts) + фильтр "мои артефакты" —
     полный скан растущей таблицы без индекса.
   - tc_trades(ts, id): "ORDER BY ts DESC, id DESC LIMIT ?" — растущий
     журнал сделок (idx_tc_trades_ts из 050_tc_market_indexes.ts уже
     покрывает одиночный ts; здесь — составной индекс под пагинацию
     с тай-брейком по id).
   - marketplace_listings(status, listed_at): "WHERE status='active'
     ORDER BY listed_at DESC" — старый индекс покрывал только status.

   Экспортируем функцию (не самовызывающийся side-effect импорт),
   т.к. tc_trades создаётся только внутри runOrderBookMigration(),
   которая вызывается в server.ts уже ПОСЛЕ фазы импортов — самовызов
   при импорте упал бы на "no such table: tc_trades" на свежей БД.
   ================================================================ */

export function runPerfIndexesMigration() {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_artifacts_owner_id ON artifacts(owner_id);`)
  } catch (e: any) {
    console.warn(`[migration:051] Skipping idx_artifacts_owner_id: ${e.message}`)
  }
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tc_trades_ts_id ON tc_trades(ts DESC, id DESC);`)
  } catch (e: any) {
    console.warn(`[migration:051] Skipping idx_tc_trades_ts_id: ${e.message}`)
  }
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_listings_status_listed_at ON marketplace_listings(status, listed_at DESC);`,
    )
  } catch (e: any) {
    console.warn(`[migration:051] Skipping idx_listings_status_listed_at: ${e.message}`)
  }
}
