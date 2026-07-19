import db from '../lib/db'

/* ================================================================
   OSGARD MIGRATION 011: PERFORMANCE INDEXES
   ================================================================
   Добавляет индексы для ускорения часто используемых запросов:
   - users: поиск по email и referral_code
   - transactions: фильтрация по user_id и сортировка по created_at
   - order_book: фильтрация по status и user_id
   - withdrawals: составной индекс (userId, createdAt)

   Безопасна для повторного запуска: все индексы создаются
   с IF NOT EXISTS.
   ================================================================ */

export function runIndexesMigration() {
  console.log('[migration:011] Starting indexes migration...')

  // --- users ---
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);`)
  console.log('[migration:011] Indexes on users ensured')

  // --- transactions ---
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);`)
  console.log('[migration:011] Indexes on transactions ensured')

  // --- order_book ---
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_book_status ON order_book(status);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_order_book_user_id ON order_book(user_id);`)
  console.log('[migration:011] Indexes on order_book ensured')

  // --- withdrawals ---
  db.exec(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id_created_at ON withdrawals(user_id, created_at);`)
  console.log('[migration:011] Index on withdrawals ensured')

  console.log('[migration:011] Indexes migration completed successfully')
}

/* Позволяет запускать файл напрямую: tsx src/migrations/011_indexes.ts */
if (require.main === module) {
  runIndexesMigration()
}
