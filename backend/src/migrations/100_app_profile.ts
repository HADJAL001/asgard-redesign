import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 094: профиль приложения
   ----------------------------------------------------------------
   Платформа умела ровно один вид приложения — статический экспорт:
   только клиент и localStorage. Первая живая прод-генерация показала
   цену этого ограничения фактом: 48 файлов готового приложения, в них
   ноль API-роутов, ноль обращений к базе, ноль платежей. Витрина, а не
   продукт, который можно продать.

   Профиль (lib/app-profiles.ts) делает режим приложения свойством
   проекта, а не константой в коде генератора:
     'static'    — как раньше: статический экспорт, деплой на Netlify;
     'fullstack' — API-роуты, серверные компоненты, своя база Supabase.

   Grandfather: NOT NULL DEFAULT 'static'. Здесь дефолт — не догадка:
   все существующие проекты физически собраны со `output: "export"`,
   так что 'static' — их фактическое состояние, а не приписанное.

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 091).
   ================================================================ */

export function runAppProfileMigration() {
  const projectsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()
  if (!projectsExists) return

  const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("app_profile")) {
    db.exec(`ALTER TABLE projects ADD COLUMN app_profile TEXT NOT NULL DEFAULT 'static'`)
    console.log("✅ Migration 094: added projects.app_profile (default 'static')")
  }

  console.log("✅ Migration 094: App profile ready")
}

runAppProfileMigration()
