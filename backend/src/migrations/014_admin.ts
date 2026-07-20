import db from '../lib/db';

const ADMIN_SEED_EMAIL = 'osman.osmanov0099@gmail.com';

export function runAdminMigration() {
  // Добавляем колонку banned в таблицу users
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes('banned')) {
    db.prepare(`ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✅ Migration 014: added banned column');
  }

  if (!columns.includes('role')) {
    db.prepare(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`).run();
    console.log('✅ Migration 014: added role column');
  }

  // Идемпотентно назначаем role='admin' целевому аккаунту разработчика.
  // Самовосстанавливается при каждом рестарте — сработает и если аккаунт
  // регистрируется уже после первого запуска этой миграции.
  try {
    const info = db
      .prepare(`UPDATE users SET role = 'admin' WHERE email = ? AND role != 'admin'`)
      .run(ADMIN_SEED_EMAIL);
    if (info.changes > 0) {
      console.log(`✅ Migration 014: granted admin role to ${ADMIN_SEED_EMAIL}`);
    }
  } catch (e: any) {
    console.warn(`[migration:014] Could not seed admin role: ${e.message}`);
  }
}

if (require.main === module) {
  runAdminMigration();
}
