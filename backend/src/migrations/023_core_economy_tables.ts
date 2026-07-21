import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 023: недостающие таблицы экономики

   stakes/tc_market_state/marketplace_listings/hall_of_fame/
   tc_price_history/tc_transactions определены только в scripts/init-db.ts —
   ручном скрипте, который не выполняется при обычном старте сервера
   (в отличие от остальных миграций, подключённых в server.ts). Из-за этого
   на любой базе, не проинициализированной вручную через `npm run init-db`
   (в т.ч., судя по всему, на проде), биржа/стейкинг/маркетплейс/зал славы
   падали с "no such table". Здесь создаём те же таблицы идемпотентно.
   ================================================================ */

export function runCoreEconomyTablesMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stakes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount_tc REAL NOT NULL,
      days INTEGER NOT NULL,
      apr REAL NOT NULL,
      market_fee REAL NOT NULL,
      start_ts INTEGER NOT NULL,
      end_ts INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS tc_market_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      price REAL NOT NULL,
      minted REAL NOT NULL,
      burned REAL NOT NULL,
      staked REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS marketplace_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id INTEGER NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
      seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'credits',
      status TEXT NOT NULL DEFAULT 'active',
      listed_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      sold_at INTEGER,
      buyer_id INTEGER REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS hall_of_fame (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
      artifact_name TEXT NOT NULL,
      type TEXT NOT NULL,
      rarity TEXT NOT NULL,
      architect TEXT NOT NULL,
      price REAL NOT NULL,
      achieved_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );

    CREATE TABLE IF NOT EXISTS tc_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tc_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      amount_tc REAL NOT NULL,
      amount_usd REAL NOT NULL,
      price REAL NOT NULL,
      ts INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_stakes_user ON stakes(user_id);
    CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status);
    CREATE INDEX IF NOT EXISTS idx_tctx_user ON tc_transactions(user_id);
  `)

  const marketExists = db.prepare(`SELECT id FROM tc_market_state WHERE id = 1`).get()
  if (!marketExists) {
    const TC_START_PRICE = 12.4
    const TC_MINTED = 900_000
    const TC_BURNED_BASE = 96_400
    const TC_STAKED_BASE = 240_000

    db.prepare(
      `INSERT INTO tc_market_state (id, price, minted, burned, staked) VALUES (1, ?, ?, ?, ?)`,
    ).run(TC_START_PRICE, TC_MINTED, TC_BURNED_BASE, TC_STAKED_BASE)
    db.prepare(`INSERT INTO tc_price_history (ts, price) VALUES (?, ?)`).run(Date.now(), TC_START_PRICE)
  }
}

runCoreEconomyTablesMigration()
