import db from "../lib/db"

export function runCreatorQuestsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_quests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      quest_key TEXT NOT NULL,
      period_key TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      UNIQUE(user_id, quest_key, period_key)
    );
    CREATE INDEX IF NOT EXISTS idx_creator_quests_user ON creator_quests(user_id, period_key);
  `)
}

