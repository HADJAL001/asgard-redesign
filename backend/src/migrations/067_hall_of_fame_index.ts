import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 067: индекс hall_of_fame(price)
   ----------------------------------------------------------------
   halloffame.routes.ts и marketplace.routes.ts делают
   "ORDER BY price DESC LIMIT ?" по растущей таблице hall_of_fame.
   Без индекса запрос уходит в SCAN + TEMP B-TREE FOR ORDER BY.
   ================================================================ */

export function runHallOfFameIndexMigration() {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hall_of_fame_price ON hall_of_fame(price DESC);`)
  } catch (e: any) {
    console.warn(`[migration:067] Skipping idx_hall_of_fame_price: ${e.message}`)
  }
}

runHallOfFameIndexMigration()
