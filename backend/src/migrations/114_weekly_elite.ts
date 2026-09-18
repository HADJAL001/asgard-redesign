import db from "../lib/db"

export function runWeeklyEliteMigration() {
  const columns = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === "weekly_elite_until")) {
    db.prepare(`ALTER TABLE users ADD COLUMN weekly_elite_until INTEGER`).run()
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS weekly_elite_rewards (
      week_key TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      post_id INTEGER NOT NULL,
      likes INTEGER NOT NULL,
      granted_at INTEGER NOT NULL
    );
  `)
}
