import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 024: гарантируем каноническую схему projects
   ----------------------------------------------------------------
   Та же проблема расхождения двух схем, что и в миграциях 018/019/020:
   легаси-схема (устаревшая, ныне удалённая ручная миграция) создаёт projects
   с колонками id/user_id/name/description/status/created_at/updated_at,
   а весь текущий код (projects.routes.ts, demo.routes.ts) рассчитывает
   на канонические колонки badge/artifact_count/sold/income (схема из
   scripts/init-db.ts). Без этой миграции GET /projects/mine и
   POST /projects падают с "no such column: badge" на любой БД,
   изначально созданной через легаси-путь.
   Миграция добавляет недостающие колонки, ничего не удаляя.
   ================================================================ */

export function runEnsureProjectsSchemaMigration() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()

  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  const ensureColumn = (name: string, ddl: string) => {
    if (!columns.includes(name)) {
      db.prepare(`ALTER TABLE projects ADD COLUMN ${ddl}`).run()
      columns.push(name)
    }
  }

  ensureColumn("badge", "badge TEXT")
  ensureColumn("artifact_count", "artifact_count INTEGER NOT NULL DEFAULT 0")
  ensureColumn("sold", "sold INTEGER NOT NULL DEFAULT 0")
  ensureColumn("income", "income REAL NOT NULL DEFAULT 0")
}

runEnsureProjectsSchemaMigration()
