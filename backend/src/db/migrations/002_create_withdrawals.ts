import Database from 'better-sqlite3';
import path from 'path';

// Путь к базе данных
const dbPath = path.join(__dirname, '../../../data/osgard.db');

export function up() {
  const db = new Database(dbPath);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      signature TEXT NOT NULL,
      externalAddress TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Создаем индексы для быстрого поиска
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_withdrawals_userId ON withdrawals(userId);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_signature ON withdrawals(signature);
    CREATE INDEX IF NOT EXISTS idx_withdrawals_createdAt ON withdrawals(createdAt);
  `);
  
  console.log('✅ Table "withdrawals" created with indexes');
  db.close();
}

export function down() {
  const db = new Database(dbPath);
  db.exec(`DROP TABLE IF EXISTS withdrawals`);
  console.log('❌ Table "withdrawals" dropped');
  db.close();
}

// Если запускаем файл напрямую
if (require.main === module) {
  up();
}
