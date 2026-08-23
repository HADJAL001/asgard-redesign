import db from "../lib/db"

db.exec(`
  CREATE TABLE IF NOT EXISTS timecoin_purchases (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id             INTEGER NOT NULL,
    quantity            INTEGER NOT NULL CHECK(quantity > 0),
    amount_cents        INTEGER NOT NULL CHECK(amount_cents > 0),
    provider            TEXT NOT NULL,
    provider_session_id TEXT NOT NULL UNIQUE,
    created_at          INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_timecoin_purchases_user ON timecoin_purchases(user_id, created_at DESC);
`)
