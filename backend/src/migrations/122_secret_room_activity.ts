import db from "../lib/db"

export function runSecretRoomActivityMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS secret_room_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES secret_rooms(id) ON DELETE CASCADE,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      kind TEXT NOT NULL,
      detail TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_secret_room_activity_room ON secret_room_activity(room_id, created_at DESC);
  `)
}
