import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 025: колонки для AI-генератора артефактов
   ----------------------------------------------------------------
   Добавляет nullable-колонки к artifacts для AI-сгенерированных
   полей (description, lore, ai_visual, source, unique_hash).
   Существующие вручную-скованные артефакты (POST /forge) получают
   NULL в этих колонках — обратная совместимость сохраняется.
   Уникальность обеспечивается на уровне приложения (SELECT-проверка
   + retry в route), НЕ через SQL UNIQUE constraint — жёсткий
   constraint бросал бы исключение вместо контролируемой регенерации
   с retry/suffix-фоллбэком.
   ================================================================ */

export function runAiArtifactsMigration() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()
  if (!tableExists) return

  const columns = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)

  const ensureColumn = (name: string, ddl: string) => {
    if (!columns.includes(name)) {
      db.prepare(`ALTER TABLE artifacts ADD COLUMN ${ddl}`).run()
      columns.push(name)
    }
  }

  ensureColumn("description", "description TEXT")
  ensureColumn("lore", "lore TEXT")
  ensureColumn("ai_visual", "ai_visual TEXT")
  ensureColumn("source", "source TEXT")
  ensureColumn("unique_hash", "unique_hash TEXT")
}

runAiArtifactsMigration()
