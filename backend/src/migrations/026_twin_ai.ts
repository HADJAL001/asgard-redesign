import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 026: колонки для AI-обогащения близнеца
   ----------------------------------------------------------------
   Добавляет nullable-колонки к twin_artifacts для описания,
   сгенерированного DeepSeek (description, source). Существующие
   артефакты близнеца получают NULL — обратная совместимость
   сохраняется.
   ================================================================ */

export function runTwinAiMigration() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='twin_artifacts'`)
    .get()
  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(twin_artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)

  const ensureColumn = (name: string, ddl: string) => {
    if (!columns.includes(name)) {
      db.prepare(`ALTER TABLE twin_artifacts ADD COLUMN ${ddl}`).run()
      columns.push(name)
    }
  }

  ensureColumn("description", "description TEXT")
  ensureColumn("source", "source TEXT")
}

runTwinAiMigration()
