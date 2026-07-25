import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 071: Сезонные дропы маркетплейса
   ----------------------------------------------------------------
   «Дроп» — лимитированное по времени и количеству предложение: особый
   артефакт с усиленными статами, который можно забрать (сминтить) по
   фиксированной цене, пока не закончится тираж или не истечёт окно.
   Механика честная:
     - total_supply — реальный жёсткий лимит; claimed растёт атомарно
       внутри транзакции клейма, дважды забрать один дроп нельзя;
     - окно [starts_at, ends_at] — реальный дедлайн (обратный отсчёт на
       фронте считает по ends_at, а не по фейковому таймеру);
     - каждый пользователь может забрать дроп один раз (UNIQUE claim).

   Таблицы:
     market_drops        — каталог дропов (сезон = набор дропов).
     market_drop_claims  — кто и что забрал (учёт тиража + анти-дубль).

   Стартовый сезон «Genesis» сеется один раз: 500 экземпляров, окно 30
   дней от первого запуска миграции. Никаких выдуманных «уже забрано» —
   claimed стартует с 0 и растёт только от реальных клеймов.
   ================================================================ */

export function runMarketDropsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS market_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      artifact_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'artifact',
      rarity TEXT NOT NULL DEFAULT 'epic',
      level INTEGER NOT NULL DEFAULT 1,
      power INTEGER NOT NULL DEFAULT 0,
      defense INTEGER NOT NULL DEFAULT 0,
      magic INTEGER NOT NULL DEFAULT 0,
      speed INTEGER NOT NULL DEFAULT 0,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'timecoin',
      total_supply INTEGER NOT NULL,
      claimed INTEGER NOT NULL DEFAULT 0,
      per_user_limit INTEGER NOT NULL DEFAULT 1,
      starts_at INTEGER NOT NULL,
      ends_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL DEFAULT 0
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS market_drop_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drop_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      artifact_id INTEGER,
      claimed_at INTEGER NOT NULL,
      UNIQUE(drop_id, user_id),
      FOREIGN KEY (drop_id) REFERENCES market_drops(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_market_drops_status ON market_drops(status, ends_at)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_drop_claims_drop ON market_drop_claims(drop_id)`)

  /* Сид стартового сезона «Genesis» — только если дропов ещё нет вообще
     (идемпотентно; не плодит дубли при повторных запусках). */
  const existing: any = db.prepare(`SELECT COUNT(*) AS n FROM market_drops`).get()
  if (Number(existing?.n || 0) === 0) {
    const now = Date.now()
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
    db.prepare(
      `INSERT INTO market_drops
         (season, title, description, artifact_name, type, rarity, level, power, defense, magic, speed,
          price, currency, total_supply, claimed, per_user_limit, starts_at, ends_at, status, created_at)
       VALUES
         (?, ?, ?, ?, 'artifact', 'legendary', 5, 78, 74, 82, 70,
          ?, 'timecoin', 500, 0, 1, ?, ?, 'active', ?)`,
    ).run(
      "Genesis",
      "Genesis · Печать Первотворца",
      "Первый сезонный дроп OSGARD. Легендарный артефакт с усиленными статами — 500 экземпляров, окно 30 дней. Уйдёт навсегда, когда закончится тираж или время.",
      "Печать Первотворца",
      25,
      now,
      now + THIRTY_DAYS,
      now,
    )
  }
}

runMarketDropsMigration()
