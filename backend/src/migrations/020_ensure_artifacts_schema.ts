import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 020: гарантируем каноническую схему artifacts
   ----------------------------------------------------------------
   Та же проблема расхождения двух схем, что и в миграциях 018/019,
   но здесь ещё и другие имена колонок: легаси-схема
   (db/migrations/001_initial_schema.ts) создаёт artifacts с
   user_id/stats(JSON)/price_tc/is_listed, а весь текущий код
   (artifacts.routes.ts, demo.routes.ts, projects.routes.ts,
   marketplace.routes.ts, twin.routes.ts, leaderboard.routes.ts)
   рассчитывает на owner_id + скалярные power/defense/magic/speed +
   status/views_24h/supply/price/list_currency (canonical-схема из
   scripts/init-db.ts). Без этой миграции GET /artifacts/mine и
   POST /artifacts/forge падают с "no such column: power" на любой
   БД, изначально созданной через легаси-путь.
   Миграция переименовывает/добавляет колонки и переносит данные,
   ничего не удаляя.
   ================================================================ */

export function runEnsureArtifactsSchemaMigration() {
  const tableExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()

  if (!tableExists) {
    db.exec(`
      CREATE TABLE artifacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        rarity TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        power INTEGER NOT NULL,
        defense INTEGER NOT NULL,
        magic INTEGER NOT NULL,
        speed INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'kept',
        views_24h INTEGER NOT NULL DEFAULT 0,
        supply INTEGER NOT NULL DEFAULT 1,
        price REAL NOT NULL DEFAULT 0,
        list_currency TEXT NOT NULL DEFAULT 'credits',
        visual_effect TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
      );
    `)
    return
  }

  const legacyColumns = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map(
    (c) => c.name,
  )

  if (legacyColumns.includes("user_id") && !legacyColumns.includes("owner_id")) {
    db.exec(`ALTER TABLE artifacts RENAME COLUMN user_id TO owner_id`)
  }

  const columns = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)

  const ensureColumn = (name: string, ddl: string) => {
    if (!columns.includes(name)) {
      db.prepare(`ALTER TABLE artifacts ADD COLUMN ${ddl}`).run()
      columns.push(name)
    }
  }

  ensureColumn("power", "power INTEGER NOT NULL DEFAULT 15")
  ensureColumn("defense", "defense INTEGER NOT NULL DEFAULT 15")
  ensureColumn("magic", "magic INTEGER NOT NULL DEFAULT 15")
  ensureColumn("speed", "speed INTEGER NOT NULL DEFAULT 15")
  ensureColumn("status", "status TEXT NOT NULL DEFAULT 'kept'")
  ensureColumn("views_24h", "views_24h INTEGER NOT NULL DEFAULT 0")
  ensureColumn("supply", "supply INTEGER NOT NULL DEFAULT 1")
  ensureColumn("price", "price REAL NOT NULL DEFAULT 0")
  ensureColumn("list_currency", "list_currency TEXT NOT NULL DEFAULT 'credits'")
  ensureColumn("visual_effect", "visual_effect TEXT")

  if (legacyColumns.includes("stats")) {
    const rows = db
      .prepare(`SELECT id, stats FROM artifacts WHERE stats IS NOT NULL`)
      .all() as Array<{ id: number; stats: string }>
    const update = db.prepare(`UPDATE artifacts SET power = ?, defense = ?, magic = ?, speed = ? WHERE id = ?`)
    for (const row of rows) {
      try {
        const s = JSON.parse(row.stats)
        update.run(s.power ?? 15, s.defense ?? 15, s.magic ?? 15, s.speed ?? 15, row.id)
      } catch {
        /* повреждённый JSON — оставляем дефолты */
      }
    }
  }

  if (legacyColumns.includes("price_tc")) {
    db.exec(`UPDATE artifacts SET price = price_tc WHERE price_tc IS NOT NULL AND (price IS NULL OR price = 0)`)
  }

  if (legacyColumns.includes("is_listed")) {
    db.exec(`UPDATE artifacts SET status = CASE WHEN is_listed = 1 THEN 'listed' ELSE 'kept' END`)
  }
}

runEnsureArtifactsSchemaMigration()
