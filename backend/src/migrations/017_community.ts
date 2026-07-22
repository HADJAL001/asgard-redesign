import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 017: таблицы posts и comments (сообщество/Татерна)
   ================================================================ */

export function runCommunityMigration() {
  /* users.display_name/avatar_url/level/bio отсутствуют в фактической схеме
     (легаси-схема без них), хотя auth.routes.ts (PATCH /auth/me) и
     новые роуты постов/комментариев уже на них рассчитывают — добавляем,
     если колонок ещё нет, по паттерну миграции 015_social_login. */
  const userColumns = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!userColumns.includes("display_name")) {
    db.prepare(`ALTER TABLE users ADD COLUMN display_name TEXT`).run()
  }
  if (!userColumns.includes("avatar_url")) {
    db.prepare(`ALTER TABLE users ADD COLUMN avatar_url TEXT`).run()
  }
  if (!userColumns.includes("level")) {
    db.prepare(`ALTER TABLE users ADD COLUMN level INTEGER NOT NULL DEFAULT 1`).run()
  }
  if (!userColumns.includes("bio")) {
    db.prepare(`ALTER TABLE users ADD COLUMN bio TEXT`).run()
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at);
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
  `)
}

runCommunityMigration()
