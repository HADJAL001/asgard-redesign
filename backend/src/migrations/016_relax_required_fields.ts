import db from '../lib/db';

// SQLite не поддерживает ALTER TABLE ... ALTER COLUMN, поэтому ослабление
// NOT NULL на email/password_hash (нужно для чисто соц-аккаунтов без пароля
// и для провайдеров без email, например Twitter/X) требует пересборки таблицы
// по официальной процедуре: https://www.sqlite.org/lang_altertable.html#otheralter
export function runRelaxRequiredFieldsMigration() {
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{
    name: string;
    notnull: number;
  }>;
  const passwordHashCol = tableInfo.find((c) => c.name === 'password_hash');

  if (!passwordHashCol || passwordHashCol.notnull === 0) {
    // Уже ослаблено (или колонки почему-то нет) — миграция не нужна.
    return;
  }

  const tableRow = db
    .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
    .get() as { sql: string } | undefined;

  if (!tableRow) {
    console.warn('[migration:016] table users not found, skipping');
    return;
  }

  const indexRows = db
    .prepare(
      `SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'users' AND sql IS NOT NULL`
    )
    .all() as Array<{ name: string; sql: string }>;

  let newTableSql = tableRow.sql
    .replace('CREATE TABLE users (', 'CREATE TABLE users_new (')
    .replace('email TEXT UNIQUE NOT NULL', 'email TEXT UNIQUE')
    .replace('password_hash TEXT NOT NULL', 'password_hash TEXT');

  if (newTableSql === tableRow.sql.replace('CREATE TABLE users (', 'CREATE TABLE users_new (')) {
    console.warn('[migration:016] expected NOT NULL clauses not found in table SQL, aborting to avoid data loss');
    return;
  }

  db.exec('PRAGMA foreign_keys = OFF');

  try {
    db.exec('BEGIN IMMEDIATE');

    db.exec(newTableSql);
    db.exec('INSERT INTO users_new SELECT * FROM users');
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');

    for (const idx of indexRows) {
      db.exec(idx.sql);
    }

    const fkViolations = db.prepare('PRAGMA foreign_key_check').all();
    if (fkViolations.length > 0) {
      throw new Error(`foreign_key_check found ${fkViolations.length} violation(s) after rebuild`);
    }

    db.exec('COMMIT');
    console.log('✅ Migration 016: relaxed NOT NULL on users.email/password_hash');
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[migration:016] rebuild failed, rolled back:', e);
    throw e;
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}

if (require.main === module) {
  runRelaxRequiredFieldsMigration();
}
