import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 032: таблица withdrawals

   Ранее создавалась только вручную через backend/src/db/migrations/
   002_create_withdrawals.ts, который не подключён к автозапуску
   сервера (в отличие от миграций из этой папки). Из-за этого на
   чистой БД `POST /api/tc/withdraw` (backend/src/routes/tc.routes.ts)
   падал с "no such table: withdrawals". Схема (camelCase-колонки)
   идентична старой ручной миграции — совпадает с тем, что реально
   использует tc.routes.ts.
   ================================================================ */

export function runEnsureWithdrawalsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      signature TEXT NOT NULL,
      externalAddress TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Older environments may already have a `withdrawals` table created with
  // snake_case columns (user_id / external_address / created_at) — `CREATE TABLE
  // IF NOT EXISTS` above silently skips those, leaving a schema mismatch with
  // tc.routes.ts (which reads/writes camelCase). Bring it in line in place so
  // existing rows survive instead of crashing every server boot.
  const columns = db.prepare(`PRAGMA table_info(withdrawals)`).all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((c) => c.name))
  const legacyToCamel: Record<string, string> = {
    user_id: "userId",
    external_address: "externalAddress",
    created_at: "createdAt",
  }
  for (const [legacy, camel] of Object.entries(legacyToCamel)) {
    if (columnNames.has(legacy) && !columnNames.has(camel)) {
      try {
        db.exec(`ALTER TABLE withdrawals RENAME COLUMN ${legacy} TO ${camel};`)
      } catch (err) {
        // Не даём падению переименования колонки уронить старт всего сервера —
        // на легаси-схеме без нужной SQLite-версии просто логируем и продолжаем.
        console.warn(`[migration 032] Не удалось переименовать колонку ${legacy} -> ${camel}:`, err)
      }
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_withdrawals_userId ON withdrawals(userId);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_signature ON withdrawals(signature);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_createdAt ON withdrawals(createdAt);
  `)
}

runEnsureWithdrawalsMigration()
