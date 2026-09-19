import db from "../lib/db"

/** One-time operator-directed reset of soft Credits; materials and TimeCoin stay intact. */
export function runCreditResetMigration() {
  db.exec(`CREATE TABLE IF NOT EXISTS economy_migrations (key TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  if (db.prepare(`SELECT 1 FROM economy_migrations WHERE key = '119_reset_credits'`).get()) return

  db.transaction(() => {
    const before = db.prepare(`SELECT COUNT(*) AS wallets, COALESCE(SUM(credits), 0) AS credits FROM wallets WHERE credits <> 0`).get() as { wallets: number; credits: number }
    db.prepare(`UPDATE wallets SET credits = 0, updated_at = ? WHERE credits <> 0`).run(Date.now())
    db.prepare(`INSERT INTO economy_migrations (key, applied_at) VALUES ('119_reset_credits', ?)`).run(Date.now())
    console.log(`[migration:119] Credits reset: ${before.wallets} wallets, ${before.credits} credits`)
  })()
}
