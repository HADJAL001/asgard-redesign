import db from '../lib/db';

export function runSocialLoginMigration() {
  const tableInfo = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  const columns = tableInfo.map((col) => col.name);

  // Простые TEXT-колонки без inline UNIQUE — SQLite не позволяет добавить
  // UNIQUE-колонку через ALTER TABLE, уникальность обеспечиваем индексами ниже.
  const textColumns = ['phone', 'google_id', 'discord_id', 'facebook_id', 'twitter_id', 'github_id', 'ip_address'];
  for (const col of textColumns) {
    if (!columns.includes(col)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT`).run();
      console.log(`✅ Migration 015: added ${col} column`);
    }
  }

  if (!columns.includes('is_linked')) {
    db.prepare(`ALTER TABLE users ADD COLUMN is_linked INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✅ Migration 015: added is_linked column');
  }

  if (!columns.includes('last_login')) {
    db.prepare(`ALTER TABLE users ADD COLUMN last_login INTEGER`).run();
    console.log('✅ Migration 015: added last_login column');
  }

  // Частичные уникальные индексы: NULL-значения не участвуют в конфликте,
  // поэтому пользователи без привязанного соцаккаунта/телефона не мешают друг другу.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_facebook_id ON users(facebook_id) WHERE facebook_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_twitter_id ON users(twitter_id) WHERE twitter_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_github_id ON users(github_id) WHERE github_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `);

  console.log('✅ Migration 015_social_login completed');
}

if (require.main === module) {
  runSocialLoginMigration();
}
