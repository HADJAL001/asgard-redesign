import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 076: снаряжение Кузницы (loadout)
   ----------------------------------------------------------------
   Даёт артефактам «надетый» статус: колонка artifacts.equipped_at
   (unix-ms момента экипировки, NULL = не надет). Надетые артефакты
   образуют лоадаут пользователя, который РЕАЛЬНО усиливает статы и
   шанс редкости артефактов, рождающихся со следующим проектом
   (см. lib/forge-loadout.ts + insertStarterArtifacts).

   Полностью аддитивно и prod-safe: колонка nullable без DEFAULT-
   значения-времени (все исторические артефакты → equipped_at NULL =
   «ничего не надето» = прежнее поведение генерации 1:1). Частичный
   индекс ускоряет выборку лоадаута конкретного владельца.
   ================================================================ */

export function runArtifactLoadoutMigration() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()
  if (!tableExists) return // миграция 020 создаст таблицу; при следующем старте колонка добавится

  const cols = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes("equipped_at")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN equipped_at INTEGER`)
  }

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_artifacts_owner_equipped ON artifacts(owner_id, equipped_at)`,
  )
}

runArtifactLoadoutMigration()
