import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 003: PREMIUM ARTIFACT UPGRADE
   ================================================================
   Добавляет:
   - artifacts.visual_effect  — уникальный визуальный эффект для
     артефактов уровня 10+ (получают через премиум-усиление за ∞)

   Безопасна для повторного запуска: проверка колонки через
   PRAGMA table_info перед ALTER TABLE, а также проверку существования
   самой таблицы artifacts (на случай, если init-db ещё не запускался).
   ================================================================ */

type ColumnInfo = { name: string }

function tableExists(table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(table)
  return !!row
}

function hasColumn(table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[]
  return columns.some((c) => c.name === column)
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    console.log(`[migration:003] Added column ${table}.${column}`)
  } else {
    console.log(`[migration:003] Column ${table}.${column} already exists — skip`)
  }
}

export function runPremiumUpgradeMigration() {
  console.log("[migration:003] Starting premium upgrade migration...")

  if (!tableExists("artifacts")) {
    console.log("[migration:003] Table artifacts does not exist yet — skip (run init-db first)")
    return
  }

  addColumnIfMissing("artifacts", "visual_effect", "TEXT")

  console.log("[migration:003] Premium upgrade migration complete.")
}

/* Позволяет запускать миграцию напрямую: `tsx src/migrations/003_premium_upgrade.ts` */
if (require.main === module) {
  runPremiumUpgradeMigration()
}
