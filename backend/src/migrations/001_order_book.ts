import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 001: ORDER BOOK (tc_orders + tc_trades linkage)
   ================================================================
   Безопасна для повторного запуска: перед созданием таблиц/индексов
   используется IF NOT EXISTS, а перед добавлением колонок в
   tc_trades — проверка через PRAGMA table_info.
   ================================================================ */

type ColumnInfo = { name: string }

function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  return columns.some((c) => c.name === column)
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    console.log(`[migration:001] Added column ${table}.${column}`)
  } else {
    console.log(`[migration:001] Column ${table}.${column} already exists — skip`)
  }
}

export function runOrderBookMigration() {
  console.log("[migration:001] Starting order book migration...")

  /* ---------------- 1. Таблица ордеров (order book) ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS tc_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
      price REAL NOT NULL,
      amount REAL NOT NULL,
      filled_amount REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'partial', 'cancelled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  console.log("[migration:001] Table tc_orders ensured")

  /* ---------------- 2. Таблица tc_trades (на случай отсутствия) ---------------- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS tc_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      ts INTEGER NOT NULL,
      price REAL NOT NULL,
      amount REAL NOT NULL,
      side TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'market'
    );
  `)
  console.log("[migration:001] Table tc_trades ensured")

  /* ---------------- 2b. Недостающие колонки в tc_trades ---------------- */
  addColumnIfMissing("tc_trades", "maker_order_id", "INTEGER REFERENCES tc_orders(id) ON DELETE SET NULL")
  addColumnIfMissing("tc_trades", "taker_order_id", "INTEGER REFERENCES tc_orders(id) ON DELETE SET NULL")
  addColumnIfMissing("tc_trades", "buyer_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL")
  addColumnIfMissing("tc_trades", "seller_id", "INTEGER REFERENCES users(id) ON DELETE SET NULL")

  /* ---------------- 3. Индексы для быстрого матчинга ---------------- */
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status_side_price ON tc_orders(status, side, price);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_orders_user_id ON tc_orders(user_id);`)
  console.log("[migration:001] Indexes ensured")

  console.log("[migration:001] Order book migration completed successfully")
}

/* Позволяет запускать файл напрямую: tsx src/migrations/001_order_book.ts */
if (require.main === module) {
  runOrderBookMigration()
}
