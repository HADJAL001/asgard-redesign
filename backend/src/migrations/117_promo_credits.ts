import db from "../lib/db"

/** Expiring grants are a ledger, not minted regular currency. */
export function runPromoCreditsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS promo_credit_grants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK(amount > 0),
      remaining REAL NOT NULL CHECK(remaining >= 0),
      reason TEXT NOT NULL,
      issued_by INTEGER NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_promo_credit_spend ON promo_credit_grants(user_id, expires_at, id);
  `)
}
