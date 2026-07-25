import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 088: PROVABLY-FAIR (честно проверяемая гача)
   ================================================================
   Стартовые артефакты проекта рождаются с ГСЧ-статами и роллом
   редкости (см. lib/project-generation.ts → insertStarterArtifacts):
   это скрытый ГСЧ, влияющий на экономическую ценность, — игрок не мог
   убедиться, что «дом» не подкрутил результат. Вводим классический
   provably-fair контур (модель commit-reveal, как в честных казино):

     • server_seed        — секрет дома, НЕ раскрывается до ротации;
     • server_seed_hash   — sha256(server_seed), публикуется ЗАРАНЕЕ
                            (commit): дом связывает себя обязательством
                            до броска, подменить seed постфактум нельзя;
     • client_seed        — задаётся игроком (вносит его энтропию, дом
                            не контролирует полный вход);
     • nonce              — счётчик бросков, растёт монотонно.

   Каждый бросок: HMAC-SHA256(server_seed, `${client_seed}:${nonce}:${purpose}`)
   → детерминированный float [0,1). После ротации server_seed РАСКРЫВАЕТСЯ
   → игрок берёт (раскрытый server_seed, свой client_seed, nonce, purpose)
   и НЕЗАВИСИМО пересчитывает каждый прошлый бросок (публичный /verify),
   сверяя с сохранённым в леджере результатом. Дом не мог смошенничать,
   потому что hash был опубликован до бросков.

   Две изолированные таблицы. Ничего существующего не трогаем.
   Идемпотентно (CREATE ... IF NOT EXISTS). Самовызов при импорте.
   ================================================================ */

export function runProvablyFairMigration() {
  console.log("[migration:088] Starting provably_fair migration...")

  // Активная сид-цепочка пользователя (одна строка на игрока, lazy-создаётся).
  db.exec(`
    CREATE TABLE IF NOT EXISTS provably_fair_seeds (
      user_id               INTEGER PRIMARY KEY,
      server_seed           TEXT NOT NULL,   -- секрет, раскрывается на ротации
      server_seed_hash      TEXT NOT NULL,   -- sha256(server_seed) — публичный commit
      client_seed           TEXT NOT NULL,   -- энтропия игрока (настраивается)
      nonce                 INTEGER NOT NULL DEFAULT 0,
      prev_server_seed      TEXT,            -- раскрытый прошлый seed (проверка истории)
      prev_server_seed_hash TEXT,
      prev_nonce            INTEGER,         -- сколько бросков было на прошлом seed
      rotated_at            INTEGER,
      created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at            INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  // Леджер бросков: доказательство. Хранит ровно те входы, из которых
  // выведен результат — чтобы после раскрытия seed любой пересчитал float.
  // server_seed_hash фиксирует, ПОД КАКИМ commit'ом сделан бросок (переживает
  // ротацию: старые броски проверяются раскрытым prev_server_seed).
  db.exec(`
    CREATE TABLE IF NOT EXISTS provably_fair_rolls (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      server_seed_hash  TEXT NOT NULL,   -- commit, под которым сделан бросок
      client_seed       TEXT NOT NULL,
      nonce             INTEGER NOT NULL,
      purpose           TEXT NOT NULL,   -- контекст броска, входит в HMAC-сообщение
      count             INTEGER NOT NULL DEFAULT 1,  -- сколько float'ов из этого nonce
      results_json      TEXT NOT NULL,   -- JSON-массив полученных float'ов
      context           TEXT,            -- человекочитаемая привязка (напр. projectId)
      created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_pf_rolls_user ON provably_fair_rolls(user_id, id DESC);`)

  console.log("[migration:088] provably_fair migration complete.")
}

// Самовызов на импорте: side-effect `import "./migrations/088_provably_fair"`
// в server.ts выполняет миграцию при старте. Идемпотентно, безопасно при повторе.
runProvablyFairMigration()
