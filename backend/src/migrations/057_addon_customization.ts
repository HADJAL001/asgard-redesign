import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 057: ADDON CUSTOMIZATION (кастомные преображения)
   ================================================================
   addon_customizations — текущее кастомное "преображение" продукта
   для пользователя (имя, голос, визуальная тема) — доступно только
   при активной Premium-подписке (см. requireAddon в lib/addons.ts).

   addon_customization_unlocks — разблокированные варианты преображений
   (часть даётся сразу с Premium, часть — за прогресс/достижения из
   addon_progress, см. migration 056).

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runAddonCustomizationMigration() {
  console.log("[migration:057] Starting addon_customization migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS addon_customizations (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      product       TEXT NOT NULL CHECK(product IN ('jarvis','walli')),
      custom_name   TEXT,
      theme_key     TEXT,
      voice_key     TEXT,
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, product)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_customizations_user ON addon_customizations(user_id);`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS addon_customization_unlocks (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL,
      product           TEXT NOT NULL CHECK(product IN ('jarvis','walli')),
      option_type       TEXT NOT NULL CHECK(option_type IN ('theme','voice')),
      option_key        TEXT NOT NULL,
      unlocked_at       INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, product, option_type, option_key)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_addon_customization_unlocks_user ON addon_customization_unlocks(user_id, product);`)

  console.log("[migration:057] addon_customization migration complete.")
}

if (require.main === module) {
  runAddonCustomizationMigration()
}
