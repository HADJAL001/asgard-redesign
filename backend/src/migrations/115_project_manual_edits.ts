import db from "../lib/db"

/** Keeps a durable fact for Vibecoder rank criteria. Existing projects are
 * intentionally unknown rather than assumed untouched. */
export function runProjectManualEditsMigration() {
  const exists = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'projects'`).get()
  if (!exists) return
  const columns = db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>
  if (!columns.some((column) => column.name === "has_manual_editor_edits")) {
    db.prepare(`ALTER TABLE projects ADD COLUMN has_manual_editor_edits INTEGER`).run()
  }
  // Only projects born after this migration get a known "not edited" value.
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_projects_manual_edits_default
    AFTER INSERT ON projects
    WHEN NEW.has_manual_editor_edits IS NULL
    BEGIN
      UPDATE projects SET has_manual_editor_edits = 0 WHERE id = NEW.id;
    END;
  `)
}
