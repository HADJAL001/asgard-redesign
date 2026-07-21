import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 029: Netlify-деплой сгенерированных приложений
   ----------------------------------------------------------------
   Отдельный статус от projects.status (тот отслеживает генерацию файлов):
   deploy_status — жизненный цикл именно деплоя (deploying → deployed|failed),
   не совмещаем с status, т.к. проект может быть переопубликован/передеплоен
   много раз после того как status уже 'ready'.
   ================================================================ */

export function runNetlifyDeployMigration() {
  const tableExists = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`).get()
  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)

  const ensureColumn = (name: string, ddl: string) => {
    if (!columns.includes(name)) {
      db.prepare(`ALTER TABLE projects ADD COLUMN ${ddl}`).run()
      columns.push(name)
    }
  }

  ensureColumn("deploy_status", "deploy_status TEXT")
  ensureColumn("deploy_error", "deploy_error TEXT")
  ensureColumn("live_url", "live_url TEXT")
  ensureColumn("netlify_site_id", "netlify_site_id TEXT")
}

runNetlifyDeployMigration()
