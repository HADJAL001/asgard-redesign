import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 039: составной индекс walli_items(user_id, item_key)
   ----------------------------------------------------------------
   walli.routes.ts трижды ищет конкретный предмет пользователя через
   WHERE user_id = ? AND item_key = ? (проверка владения, экипировка,
   снятие). Существующий idx_walli_items_user_id (миграция 012) даёт
   только префикс — добавляем item_key вторым столбцом, чтобы такие
   запросы шли по индексу целиком, без фильтрации оставшихся строк.
   ================================================================ */

export function runWalliItemsIndexMigration() {
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_walli_items_user_item_key ON walli_items(user_id, item_key);`,
    )
  } catch (e: any) {
    console.warn(`[migration:039] Skipping index: ${e.message}`)
  }
}

runWalliItemsIndexMigration()
