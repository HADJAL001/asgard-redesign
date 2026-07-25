import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 069: IP и User-Agent в журнале админ-действий
   ----------------------------------------------------------------
   Добавляет колонки ip / user_agent в admin_logs, чтобы каждое
   действие администратора было привязано к источнику (адрес + клиент),
   а не только к admin_id. Идемпотентна.
   ================================================================ */

export function runAdminLogsIpUaMigration() {
  const tableInfo = db.prepare(`PRAGMA table_info(admin_logs)`).all() as Array<{ name: string }>
  const columns = tableInfo.map((c) => c.name)

  if (!columns.includes("ip")) {
    db.prepare(`ALTER TABLE admin_logs ADD COLUMN ip TEXT`).run()
    console.log("✅ Migration 069: added admin_logs.ip column")
  }
  if (!columns.includes("user_agent")) {
    db.prepare(`ALTER TABLE admin_logs ADD COLUMN user_agent TEXT`).run()
    console.log("✅ Migration 069: added admin_logs.user_agent column")
  }
  if (!columns.includes("status")) {
    db.prepare(`ALTER TABLE admin_logs ADD COLUMN status INTEGER`).run()
    console.log("✅ Migration 069: added admin_logs.status column")
  }
}

runAdminLogsIpUaMigration()
