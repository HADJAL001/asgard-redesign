import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 072: Аукционы артефактов
   ----------------------------------------------------------------
   Второй, состязательный путь сбыта: продавец выставляет свой
   артефакт с начальной ценой и окном торгов, покупатели повышают
   ставку. Механика честная, с реальным эскроу:
     - при ставке средства покупателя СПИСЫВАЮТСЯ в удержание сразу,
       а предыдущему лидеру мгновенно возвращаются — победитель не
       может оказаться неплатёжеспособным на момент завершения;
     - ставка обязана превышать текущую на min_increment (или быть
       >= стартовой, если ставок ещё нет);
     - окно [starts_at, ends_at] — реальный дедлайн; расчёт (settle)
       передаёт артефакт лидеру и платит продавцу за вычетом
       комиссии рынка (та же, что на маркетплейсе);
     - аукцион без ставок по истечении окна закрывается возвратом
       артефакта продавцу (никаких «фантомных» ставок).

   Таблицы:
     auctions       — лоты-аукционы.
     auction_bids   — история ставок (аудит + отображение).
   ================================================================ */

export function runAuctionsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS auctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      artifact_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      start_price REAL NOT NULL,
      min_increment REAL NOT NULL DEFAULT 1,
      currency TEXT NOT NULL DEFAULT 'credits',
      current_bid REAL,
      current_bidder_id INTEGER,
      bid_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      settled_at INTEGER,
      winner_id INTEGER,
      created_at INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
      FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS auction_bids (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auction_id INTEGER NOT NULL,
      bidder_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
      FOREIGN KEY (bidder_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status, ends_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id, created_at)`)
}

runAuctionsMigration()
