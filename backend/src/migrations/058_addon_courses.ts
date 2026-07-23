import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 058: ADDON COURSES (обучение)
   ================================================================
   courses          — каталог обучающих модулей по продукту (ДЖАРВИС/
                      ВАЛЛИ Premium), упорядоченный по order_index.
   course_progress  — прогресс пользователя по конкретному курсу.

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runAddonCoursesMigration() {
  console.log("[migration:058] Starting addon_courses migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS courses (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      product        TEXT NOT NULL CHECK(product IN ('jarvis','walli')),
      course_key     TEXT NOT NULL UNIQUE,
      title          TEXT NOT NULL,
      description    TEXT,
      required_tier  TEXT NOT NULL DEFAULT 'premium' CHECK(required_tier IN ('premium','elite')),
      order_index    INTEGER NOT NULL DEFAULT 0,
      xp_reward      INTEGER NOT NULL DEFAULT 0,
      created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_courses_product_order ON courses(product, order_index);`)

  db.exec(`
    CREATE TABLE IF NOT EXISTS course_progress (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      course_id     INTEGER NOT NULL,
      status        TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','completed')),
      progress_pct  INTEGER NOT NULL DEFAULT 0,
      started_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      completed_at  INTEGER,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      UNIQUE(user_id, course_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_progress(user_id);`)

  console.log("[migration:058] addon_courses migration complete.")
}

if (require.main === module) {
  runAddonCoursesMigration()
}
