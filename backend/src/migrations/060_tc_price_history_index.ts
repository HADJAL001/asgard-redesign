import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 060: индекс tc_price_history(ts)
   ----------------------------------------------------------------
   /tc-market/state (tcmarket.routes.ts) делает "ORDER BY ts DESC LIMIT 100"
   по растущему журналу истории цены. Индекс ранее создавался миграцией
   050_tc_market_indexes.ts, которая была удалена как дубликат при мёрдже
   с параллельной 051_perf_indexes.ts — но та миграция индекс на
   tc_price_history не создаёт, только artifacts/tc_trades/marketplace_listings.
   Без индекса на свежей БД запрос уходит в SCAN + TEMP B-TREE FOR ORDER BY.

   Таблица tc_price_history создаётся в 023_core_economy_tables.ts, чей
   side-effect импорт в server.ts идёт раньше этого файла — самовызов
   при импорте безопасен.
   ================================================================ */

export function runTcPriceHistoryIndexMigration() {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_tc_price_history_ts ON tc_price_history(ts DESC);`)
  } catch (e: any) {
    console.warn(`[migration:060] Skipping idx_tc_price_history_ts: ${e.message}`)
  }
}

runTcPriceHistoryIndexMigration()
