import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 033: заглушка полей KYC

   full_name — юридическое полное имя пользователя для будущей
   верификации (KYC), НЕ путать с display_name — это никнейм для UI,
   заполняемый при регистрации и не связанный с юридической личностью.
   date_of_birth/address — тоже только для будущего KYC-флоу.

   На этом этапе — только резервирование колонок (nullable, без
   индексов и без UI/API-обвязки), сама верификация будет добавлена
   отдельно.
   ================================================================ */

export function runKycFieldsMigration() {
  const columns = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!columns.includes("full_name")) {
    db.prepare(`ALTER TABLE users ADD COLUMN full_name TEXT`).run()
  }
  if (!columns.includes("date_of_birth")) {
    db.prepare(`ALTER TABLE users ADD COLUMN date_of_birth TEXT`).run()
  }
  if (!columns.includes("address")) {
    db.prepare(`ALTER TABLE users ADD COLUMN address TEXT`).run()
  }
}

runKycFieldsMigration()
