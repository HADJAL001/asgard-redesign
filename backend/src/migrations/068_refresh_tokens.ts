import db from '../lib/db';

/**
 * Миграция 068: таблица refresh_tokens для stateful refresh-токенов
 * с ротацией и детекцией повторного использования (кражи).
 *
 * Модель:
 *  - token_hash — SHA-256 от самого токена. В БД лежит только хеш, сам
 *    токен (opaque random) существует лишь у клиента. Утечка дампа БД не
 *    даёт валидных токенов.
 *  - family_id — идентификатор «семьи» токенов одной сессии. При каждой
 *    ротации старый токен отзывается, а новый наследует ту же family_id.
 *    Если приходит уже отозванный токен вне grace-окна — это признак
 *    кражи, и отзывается ВСЯ семья (все живые сессии этой цепочки).
 *  - revoked / revoked_at — мягкий отзыв (строки не удаляем, чтобы уметь
 *    отличать «невиданный токен» от «отозванного» при детекции reuse).
 *
 * Идемпотентна (CREATE TABLE/INDEX IF NOT EXISTS) — как остальные миграции
 * проекта, вызывается при каждом старте сервера.
 */
export function runRefreshTokensMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      token_hash  TEXT UNIQUE NOT NULL,
      family_id   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      revoked     INTEGER NOT NULL DEFAULT 0,
      revoked_at  INTEGER,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user   ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  `);

  console.log('✅ Migration 068: refresh_tokens table ready');
}
