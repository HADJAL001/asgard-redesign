import db from '../lib/db'

/* ================================================================
   OSGARD MIGRATION 011: PERFORMANCE INDEXES
   ================================================================
   Добавляет индексы безопасно — пропускает если таблица/колонка
   не существует (таблицы создаются необязательными миграциями).
   ================================================================ */

function safeExec(sql: string, label: string) {
  try {
    db.exec(sql)
  } catch (e: any) {
    console.warn(`[migration:011] Skipping index (${label}): ${e.message}`)
  }
}

export function runIndexesMigration() {
  console.log('[migration:011] Starting indexes migration...')

  // --- users ---
  safeExec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`, 'users.email')
  safeExec(`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);`, 'users.referral_code')
  console.log('[migration:011] Indexes on users ensured')

  // --- transactions ---
  safeExec(`CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);`, 'transactions.user_id')
  safeExec(`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);`, 'transactions.created_at')
  console.log('[migration:011] Indexes on transactions ensured')

  // --- order_book (создаётся миграцией 001) ---
  safeExec(`CREATE INDEX IF NOT EXISTS idx_order_book_status ON order_book(status);`, 'order_book.status')
  safeExec(`CREATE INDEX IF NOT EXISTS idx_order_book_user_id ON order_book(user_id);`, 'order_book.user_id')
  console.log('[migration:011] Indexes on order_book ensured')

  // --- withdrawals ---
  safeExec(`CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id_created_at ON withdrawals(user_id, created_at);`, 'withdrawals')
  console.log('[migration:011] Index on withdrawals ensured')

  console.log('[migration:011] Indexes migration completed successfully')
}

/* Позволяет запускать файл напрямую: tsx src/migrations/011_indexes.ts */
if (require.main === module) {
  runIndexesMigration()
}
