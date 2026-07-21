import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 030: умные шаблоны генерации проектов
   ----------------------------------------------------------------
   Кэш успешных генераций реального приложения (app-generator.ts),
   ключ — хэш темы+ключевых слов (НЕ названия проекта — оно уникально
   для каждого пользователя и дало бы гарантированный промах кэша).
   Хранит только выход генератора (manifest/files/artifact_types) —
   никогда user_id/project_id/created_at живого проекта, поэтому
   отдельного анонимизатора не требуется.
   ================================================================ */

export function runProjectTemplatesMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL UNIQUE,
      theme TEXT NOT NULL,
      keywords TEXT NOT NULL,
      name_sample TEXT,
      description_sample TEXT,
      badge TEXT,
      manifest TEXT NOT NULL,
      files TEXT NOT NULL,
      artifact_types TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      tokens_saved_estimate INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_project_templates_theme ON project_templates(theme);`)

  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`).get()
  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!columns.includes("template_id")) {
    db.prepare(`ALTER TABLE projects ADD COLUMN template_id INTEGER`).run()
  }
}

runProjectTemplatesMigration()
