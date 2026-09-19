import db from "../lib/db"

/** Durable one-to-one messages. A unique pair is implicit in sender/recipient rows. */
export function runDirectMessagesMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      recipient_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      read_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
      CHECK (sender_id <> recipient_id)
    );
    CREATE INDEX IF NOT EXISTS idx_direct_messages_recipient_unread
      ON direct_messages(recipient_id, read_at, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_direct_messages_pair
      ON direct_messages(sender_id, recipient_id, created_at DESC);
  `)
}
