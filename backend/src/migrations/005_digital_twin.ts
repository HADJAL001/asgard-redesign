import db from "../lib/db"

/* ================================================================
   Миграция 005 · Цифровой Близнец (Digital Twin)
   ----------------------------------------------------------------
   Таблицы:
   - user_twins           — один цифровой близнец на пользователя
   - twin_training_samples — артефакты/материалы, на которых близнец учится
   - twin_artifacts        — артефакты, сгенерированные близнецом в стиле юзера
   - twin_rentals          — аренда близнеца другими пользователями (пассивный доход)
   ================================================================ */

db.exec(`
  CREATE TABLE IF NOT EXISTS user_twins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT 'Мой Близнец',
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    style_vector TEXT NOT NULL DEFAULT '{}',      -- JSON: агрегированный "стиль" (типы, редкости, ключевые слова)
    style_tags TEXT NOT NULL DEFAULT '[]',        -- JSON-массив тегов стиля ("киберпанк", "минимализм", ...)
    trained_samples INTEGER NOT NULL DEFAULT 0,   -- сколько артефактов пользователя изучено
    artifacts_created INTEGER NOT NULL DEFAULT 0, -- сколько артефактов близнец создал сам
    is_rentable INTEGER NOT NULL DEFAULT 0,       -- сдаётся ли в аренду (0/1)
    rental_price_tc REAL NOT NULL DEFAULT 0,      -- цена аренды за сутки в TimeCoin
    total_rental_income REAL NOT NULL DEFAULT 0,  -- суммарный пассивный доход от аренды
    avatar_seed TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS twin_training_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    twin_id INTEGER NOT NULL,
    artifact_id INTEGER,                          -- ссылка на artifacts.id, если источник — существующий артефакт
    source TEXT NOT NULL DEFAULT 'artifact',       -- 'artifact' | 'manual'
    label TEXT NOT NULL DEFAULT '',                -- краткое описание материала
    xp_gained INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (twin_id) REFERENCES user_twins(id)
  );

  CREATE TABLE IF NOT EXISTS twin_artifacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    twin_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'common',
    power INTEGER NOT NULL DEFAULT 0,
    defense INTEGER NOT NULL DEFAULT 0,
    magic INTEGER NOT NULL DEFAULT 0,
    speed INTEGER NOT NULL DEFAULT 0,
    style_tag TEXT NOT NULL DEFAULT '',
    prompt TEXT NOT NULL DEFAULT '',              -- запрос, из которого сгенерирован ("создай в моём стиле...")
    created_at INTEGER NOT NULL,
    FOREIGN KEY (twin_id) REFERENCES user_twins(id),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS twin_rentals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    twin_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,      -- владелец близнеца (получает доход)
    renter_id INTEGER NOT NULL,     -- кто арендует
    days INTEGER NOT NULL,
    total_price_tc REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'ended'
    started_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (twin_id) REFERENCES user_twins(id),
    FOREIGN KEY (owner_id) REFERENCES users(id),
    FOREIGN KEY (renter_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_twin_training_twin ON twin_training_samples(twin_id);
  CREATE INDEX IF NOT EXISTS idx_twin_artifacts_twin ON twin_artifacts(twin_id);
  CREATE INDEX IF NOT EXISTS idx_twin_artifacts_owner ON twin_artifacts(owner_id);
  CREATE INDEX IF NOT EXISTS idx_twin_rentals_owner ON twin_rentals(owner_id);
  CREATE INDEX IF NOT EXISTS idx_twin_rentals_renter ON twin_rentals(renter_id);
  CREATE INDEX IF NOT EXISTS idx_twin_rentals_status ON twin_rentals(status);
`)

console.log("[migration 005] user_twins, twin_training_samples, twin_artifacts, twin_rentals — OK")
