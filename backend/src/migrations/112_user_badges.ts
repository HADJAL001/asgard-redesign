import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 112: USER BADGES (бейджи за стиль работы)
   ----------------------------------------------------------------
   Отдельная лестница от «Ранга Вайбкодера» (architect_xp/architect_tier,
   миграция 079): та растёт монотонно за объём реальных дел, эти бейджи —
   моментальные знаки отличия за КОНКРЕТНЫЙ стиль одного события (быстрая
   генерация, генерация с несколькими AI-провайдерами, безошибочный деплой
   с первого раза, полный расход кредитов). Не новая система прогрессии —
   просто лог фактов, вычисляемый по уже существующим данным.

   UNIQUE(user_id, badge_key) — бейдж выдаётся один раз, повторные события
   того же стиля не создают дублей (idempotent INSERT OR IGNORE).

   Безопасна для повторного запуска.
   ================================================================ */

export function runUserBadgesMigration() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        badge_key TEXT NOT NULL,
        earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        meta TEXT,
        UNIQUE(user_id, badge_key)
      )
    `)
  } catch (e: any) {
    console.warn("[migration 112] user_badges table:", e?.message)
  }

  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id)`)
  } catch (e: any) {
    console.warn("[migration 112] idx_user_badges_user:", e?.message)
  }

  // Счётчик попыток деплоя — нужен только чтобы отличить «задеплоено с первого
  // раза» (бейдж 🛡️ Чистюля) от «получилось после ремонта». Инкрементируется
  // на каждом запуске деплоя, независимо от исхода.
  try {
    db.exec(`ALTER TABLE projects ADD COLUMN deploy_attempts INTEGER NOT NULL DEFAULT 0`)
  } catch (e: any) {
    console.warn("[migration 112] projects.deploy_attempts:", e?.message)
  }
}

if (require.main === module) {
  runUserBadgesMigration()
}
