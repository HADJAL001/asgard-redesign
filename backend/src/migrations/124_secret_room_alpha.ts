import db from "../lib/db"

/** Stores the release that Secret Room members are entitled to preview early. */
db.exec(`
  CREATE TABLE IF NOT EXISTS secret_room_alpha_releases (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    published_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`)
