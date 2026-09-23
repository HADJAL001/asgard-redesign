import db from "../lib/db"

/** Per-account white-label design settings. The owner id is the isolation boundary. */
db.exec(`
  CREATE TABLE IF NOT EXISTS tenant_design_brands (
    user_id INTEGER PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    accent TEXT NOT NULL,
    display_font TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
