import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 031: личность ВАЛЛИ (jarvis-personality.service.ts)
   ----------------------------------------------------------------
   Хранит выбранный пользователем режим общения ВАЛЛИ (quotes/savage/
   poet/news/default) и метку последнего еженедельного новостного
   дайджеста — используется jarvis.service.ts/jarvis.routes.ts.
   ================================================================ */

export function runJarvisPersonalityMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS jarvis_personality (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL UNIQUE,
      mode          TEXT NOT NULL DEFAULT 'default' CHECK(mode IN ('quotes','savage','poet','news','default')),
      last_news_at  INTEGER,
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_jarvis_personality_user_id ON jarvis_personality(user_id);`)
}

runJarvisPersonalityMigration()
