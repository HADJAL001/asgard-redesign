import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 074: глубина генерации проекта
   ----------------------------------------------------------------
   projects.generation_depth фиксирует, каким уровнем глубины был
   создан проект (quick | standard | deep). Нужна, чтобы бесплатная
   дневная квота тарифа считала только quick-генерации, а платные
   (standard/deep, списанные кредитами) её не расходовали.

   ALTER TABLE ADD COLUMN с DEFAULT 'quick' проставит значение и всем
   существующим строкам — исторические проекты трактуются как quick.
   ================================================================ */

export function runGenerationDepthMigration() {
  const cols = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
  const has = cols.some((c) => c.name === "generation_depth")
  if (!has) {
    db.exec(`ALTER TABLE projects ADD COLUMN generation_depth TEXT NOT NULL DEFAULT 'quick'`)
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_projects_user_depth ON projects(user_id, generation_depth, created_at)`)
}

runGenerationDepthMigration()
