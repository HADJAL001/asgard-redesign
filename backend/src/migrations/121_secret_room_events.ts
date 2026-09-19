import db from "../lib/db"

/** Paid events are scoped to an active Secret Room and settle exclusively in TimeCoin. */
export function runSecretRoomEventsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS secret_room_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id INTEGER NOT NULL REFERENCES secret_rooms(id) ON DELETE CASCADE,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      starts_at INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      price_timecoin REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK(capacity >= 1),
      CHECK(price_timecoin >= 0)
    );
    CREATE INDEX IF NOT EXISTS idx_secret_room_events_room ON secret_room_events(room_id, starts_at);
    CREATE TABLE IF NOT EXISTS secret_room_event_attendees (
      event_id INTEGER NOT NULL REFERENCES secret_room_events(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paid_timecoin REAL NOT NULL,
      booked_at INTEGER NOT NULL,
      PRIMARY KEY(event_id, user_id)
    );
  `)
}
