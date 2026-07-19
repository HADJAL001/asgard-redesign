import db from '../lib/db';

export function run2FAMigration() {
  // Добавляем колонки для 2FA в таблицу users
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes('twofa_secret')) {
    db.prepare(`ALTER TABLE users ADD COLUMN twofa_secret TEXT DEFAULT NULL`).run();
    console.log('✅ Migration 009: added twofa_secret column');
  }

  if (!columns.includes('twofa_enabled')) {
    db.prepare(`ALTER TABLE users ADD COLUMN twofa_enabled INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✅ Migration 009: added twofa_enabled column');
  }
}
