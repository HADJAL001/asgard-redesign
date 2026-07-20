import db from '../lib/db'

/* ================================================================
   OSGARD MIGRATION 012: WALLI UPGRADE SYSTEM
   ================================================================
   Создаёт 4 таблицы для системы прокачки ВАЛЛИ:

   walli_abilities  — способности (find_artifacts | trade | analyze)
                      level 1–∞, bonus float
   walli_training   — обучение (уровни 1–5, активное/завершённое)
   walli_quests     — квесты (прогресс и завершение)
   walli_items      — предметы магазина (скины, аксессуары, эксклюзив)

   Безопасна для повторного запуска: CREATE TABLE IF NOT EXISTS.
   ================================================================ */

export function runWalliSystemMigration() {
  console.log('[migration:012] Starting WALLI system migration...')

  // ─── walli_abilities ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS walli_abilities (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      ability_type TEXT    NOT NULL CHECK(ability_type IN ('find_artifacts','trade','analyze')),
      level        INTEGER NOT NULL DEFAULT 1,
      bonus        REAL    NOT NULL DEFAULT 0.0,
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, ability_type)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_abilities_user_id ON walli_abilities(user_id);`)
  console.log('[migration:012] walli_abilities table ensured')

  // ─── walli_training ─────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS walli_training (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      training_level  INTEGER NOT NULL CHECK(training_level BETWEEN 1 AND 5),
      start_date      INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      end_date        INTEGER,
      active          INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_training_user_id ON walli_training(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_training_active ON walli_training(active);`)
  console.log('[migration:012] walli_training table ensured')

  // ─── walli_quests ────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS walli_quests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      quest_type  TEXT    NOT NULL,
      progress    INTEGER NOT NULL DEFAULT 0,
      completed   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      completed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_quests_user_id ON walli_quests(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_quests_completed ON walli_quests(completed);`)
  console.log('[migration:012] walli_quests table ensured')

  // ─── walli_items ─────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS walli_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      item_type   TEXT    NOT NULL CHECK(item_type IN ('skin','accessory','exclusive')),
      item_key    TEXT    NOT NULL,
      name        TEXT    NOT NULL,
      price_usd   REAL,
      price_tc    REAL,
      equipped    INTEGER NOT NULL DEFAULT 0,
      purchased_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_items_user_id ON walli_items(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_walli_items_equipped ON walli_items(user_id, equipped);`)
  console.log('[migration:012] walli_items table ensured')

  console.log('[migration:012] WALLI system migration completed successfully')
}

if (require.main === module) {
  runWalliSystemMigration()
}
