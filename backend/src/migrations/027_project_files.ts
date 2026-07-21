import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 027: реальные приложения — файлы проекта + статус
   ----------------------------------------------------------------
   Генерация проекта теперь создаёт настоящие файлы приложения
   (не только флейвор-текст), поэтому нужно: (1) таблица project_files
   для хранения путь→содержимое; (2) колонка projects.status —
   генерация файлов запускается асинхронно (fire-and-forget), фронтенд
   опрашивает статус вместо ожидания одного синхронного ответа.
   ================================================================ */

export function runProjectFilesMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON project_files(project_id);`)
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_project_files_project_path ON project_files(project_id, path);`)

  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`).get()
  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!columns.includes("status")) {
    db.prepare(`ALTER TABLE projects ADD COLUMN status TEXT NOT NULL DEFAULT 'ready'`).run()
  }
  if (!columns.includes("generation_error")) {
    db.prepare(`ALTER TABLE projects ADD COLUMN generation_error TEXT`).run()
  }
  if (!columns.includes("ai_source")) {
    db.prepare(`ALTER TABLE projects ADD COLUMN ai_source TEXT`).run()
  }
}

runProjectFilesMigration()
