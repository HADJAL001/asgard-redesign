import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 056: ADDON PROGRESSION (XP / уровни / достижения)
   ================================================================
   Прогрессия ДЖАРВИС/ВАЛЛИ Premium строится на активности пользователя
   (действия в продукте), а НЕ на времени/календаре подписки — это
   отдельная, построенная с нуля система, не переиспользующая
   существующие walli_abilities/training/quests/items (см. migration 012).

   addon_xp_events   — append-only журнал начисления опыта. Источник
                       истины; ничего не удаляется и не перезаписывается.
   addon_progress    — денормализованный кэш текущего level/xp/tier
                       для быстрого чтения без агрегации журнала.
                       tier переключается на 'elite' автоматически при
                       достижении ELITE_LEVEL_THRESHOLD (см. addonProgression.ts)
                       — elite НЕ покупается отдельно, а зарабатывается.
   addon_achievements — разблокированные достижения (уникальны на
                       пользователя+продукт+ключ достижения).

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runAddonProgressionMigration() {
  console.log("[migration:056] Starting addon_progression migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS addon_xp_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      product     TEXT NOT NULL CHECK(product IN ('jarvis','walli')),
      event_key   TEXT NOT NULL,
      xp_awarded  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_xp_events_user_product ON addon_xp_events(user_id, product);`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS addon_progress (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      product     TEXT NOT NULL CHECK(product IN ('jarvis','walli')),
      level       INTEGER NOT NULL DEFAULT 1,
      xp          INTEGER NOT NULL DEFAULT 0,
      tier        TEXT NOT NULL DEFAULT 'premium' CHECK(tier IN ('premium','elite')),
      updated_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, product)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_progress_user ON addon_progress(user_id);`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS addon_achievements (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL,
      product          TEXT NOT NULL CHECK(product IN ('jarvis','walli')),
      achievement_key  TEXT NOT NULL,
      unlocked_at      INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, product, achievement_key)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_achievements_user_product ON addon_achievements(user_id, product);`)

  console.log("[migration:056] addon_progression migration complete.")
}

if (require.main === module) {
  runAddonProgressionMigration()
}
