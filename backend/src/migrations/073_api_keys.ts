import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 073: B2B / white-label API-ключи
   ----------------------------------------------------------------
   Партнёрский доступ к генерации проектов по программному ключу.
   Ключ выдаётся один раз в открытом виде, в БД хранится только его
   SHA-256-хеш (как пароль) плюс видимый префикс для распознавания в
   списке. Каждый вызов публичного API списывает кредиты владельца
   ключа (честный биллинг) и пишется в api_key_usage для аудита и
   счётчиков. Ограничение частоты — по rate_per_min (enforcement в
   рантайме, скользящее окно в памяти процесса).

   Таблицы:
     api_keys        — ключи партнёров (хеш + метаданные + лимиты).
     api_key_usage   — журнал вызовов (эндпоинт, проект, стоимость).
   ================================================================ */

export function runApiKeysMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      scopes TEXT NOT NULL DEFAULT 'generate',
      status TEXT NOT NULL DEFAULT 'active',
      rate_per_min INTEGER NOT NULL DEFAULT 30,
      request_count INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      revoked_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_key_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      api_key_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL,
      project_id INTEGER,
      cost_credits REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ok',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE CASCADE
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id, status)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_api_key_usage_key ON api_key_usage(api_key_id, created_at)`)
}

runApiKeysMigration()
