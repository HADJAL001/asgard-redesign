import db from '../lib/db';

/**
 * Миграция 010: добавляет поле nonce в таблицу users.
 * Nonce — монотонно растущий счётчик, который инкрементируется
 * после каждой успешной транзакции вывода. Клиент обязан получить
 * текущее значение через GET /tc/nonce и передать его обратно
 * в теле запроса POST /tc/withdraw. Это предотвращает replay-атаки
 * при одновременных дублирующихся запросах.
 */
export function runNonceMigration() {
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes('nonce')) {
    db.prepare(`ALTER TABLE users ADD COLUMN nonce INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✅ Migration 010: added nonce column to users');
  } else {
    console.log('ℹ️  Migration 010: nonce column already exists, skipping');
  }
}
