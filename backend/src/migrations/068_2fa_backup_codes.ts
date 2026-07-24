import db from '../lib/db';

/* Добавляет колонку twofa_backup_codes — зашифрованный JSON-массив SHA-256-хешей
   одноразовых резервных кодов 2FA. Позволяет войти при потере доступа к
   TOTP-приложению. Идемпотентна (проверка через PRAGMA table_info). */
export function run2FABackupCodesMigration() {
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const columns = tableInfo.map((col) => col.name);

  if (!columns.includes('twofa_backup_codes')) {
    db.prepare(`ALTER TABLE users ADD COLUMN twofa_backup_codes TEXT DEFAULT NULL`).run();
    console.log('✅ Migration 068: added twofa_backup_codes column');
  }
}
