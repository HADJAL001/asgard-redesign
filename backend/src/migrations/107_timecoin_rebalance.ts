import db from "../lib/db"

db.exec(`
  CREATE TABLE IF NOT EXISTS economy_rebalances (
    key TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  );
`)

const apply = db.transaction(() => {
  const claim = db.prepare(
    `INSERT OR IGNORE INTO economy_rebalances (key, applied_at) VALUES ('timecoin_usd_10_v1', ?)`,
  ).run(Date.now())
  if (claim.changes !== 1) return
  db.prepare(`UPDATE jarvis_accessories SET price = MAX(0.5, ROUND(price / 20.0, 2))`).run()
  db.prepare(`UPDATE user_twins SET rental_price_tc = MAX(0.15, ROUND(rental_price_tc / 20.0, 2))`).run()
})

apply()
