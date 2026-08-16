import db from "../lib/db"

export function runRefinementKindMigration(): void {
  const columns = new Set(
    (db.prepare(`PRAGMA table_info(project_refinements)`).all() as Array<{ name: string }>).map((column) => column.name),
  )
  if (!columns.has("kind")) {
    db.exec(`ALTER TABLE project_refinements ADD COLUMN kind TEXT NOT NULL DEFAULT 'custom'`)
  }
}

runRefinementKindMigration()
