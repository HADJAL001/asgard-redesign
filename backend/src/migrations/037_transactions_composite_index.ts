import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 037: составной индекс transactions(user_id, type, created_at)
   ----------------------------------------------------------------
   Существующие idx_transactions_user_id и idx_transactions_created_at —
   раздельные одноколоночные индексы, SQLite не объединяет их для запросов
   вида "WHERE user_id = ? AND type = ? AND created_at > ?" (паттерн проверки
   суточного лимита наград, см. feedback.routes.ts). Составной индекс покрывает
   такие запросы напрямую по префиксу (user_id, type), без полного скана.
   ================================================================ */

export function runTransactionsCompositeIndexMigration() {
  try {
    db.exec(
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_type_created ON transactions(user_id, type, created_at);`,
    )
  } catch (e: any) {
    console.warn(`[migration:037] Skipping index: ${e.message}`)
  }
}

runTransactionsCompositeIndexMigration()
