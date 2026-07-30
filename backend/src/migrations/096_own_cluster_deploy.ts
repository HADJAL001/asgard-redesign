import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 096: публикация приложений на свою инфраструктуру
   ----------------------------------------------------------------
   cluster_slug — слаг приложения в нашем control-plane. Он же имя
   репозитория в Forgejo и он же поддомен: <cluster_slug>.osgard.cloud.
   Хранится, потому что имя проекта пользователь может переименовать
   (а движок ещё и перезаписывает его текстом доработки) — без
   сохранённого слага повторный деплой ушёл бы в НОВОЕ приложение,
   бросив старое работать по прежнему адресу.

   netlify_site_id (миграция 029) остаётся: аварийный запас на чужой
   площадке никуда не делся, он лишь перестал быть основным путём.
   ================================================================ */

export function runOwnClusterDeployMigration() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()
  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  )

  if (!columns.includes("cluster_slug")) {
    db.prepare(`ALTER TABLE projects ADD COLUMN cluster_slug TEXT`).run()
  }
}

runOwnClusterDeployMigration()
