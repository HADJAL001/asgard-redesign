import db from "../lib/db"

/** Keeps balances as materials and moves old active listings to TimeCoin once. */
export function runCurrencySimplificationMigration() {
  db.exec(`CREATE TABLE IF NOT EXISTS economy_migrations (key TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`)
  if (db.prepare(`SELECT 1 FROM economy_migrations WHERE key = '118_currency_simplification'`).get()) return
  const rates: Record<string, number> = { credits: 0.01, shards: 0.1, crystals: 1, cash_usd: 1, timecoin: 12.4 }
  const rows = db.prepare(`SELECT id, price, currency FROM marketplace_listings WHERE status = 'active'`).all() as Array<{ id: number; price: number; currency: string }>
  db.transaction(() => {
    for (const row of rows) {
      const tc = Math.max(0.01, Math.ceil((Number(row.price) * (rates[row.currency] ?? 0) / 12.4) * 100) / 100)
      db.prepare(`UPDATE marketplace_listings SET price = ?, currency = 'timecoin' WHERE id = ?`).run(tc, row.id)
      db.prepare(`UPDATE artifacts SET list_currency = 'timecoin' WHERE id = (SELECT artifact_id FROM marketplace_listings WHERE id = ?)`).run(row.id)
    }
    db.prepare(`UPDATE artifacts SET list_currency = 'timecoin' WHERE list_currency IN ('shards', 'crystals')`).run()
    db.prepare(`INSERT INTO economy_migrations (key, applied_at) VALUES ('118_currency_simplification', ?)`).run(Date.now())
  })()
}
