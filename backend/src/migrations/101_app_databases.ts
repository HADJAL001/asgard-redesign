import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 096: база данных, выданная приложению
   ----------------------------------------------------------------
   Приложение с профилем fullstack получает СВОЮ схему и СВОЮ роль в
   кластере Postgres (services/app-database.service.ts). Платформа
   обязана помнить, что именно выдано: без этой таблицы схема остаётся
   сиротой при удалении проекта, а строку подключения нельзя показать
   владельцу второй раз.

   Строка подключения содержит пароль роли, поэтому лежит ЗАШИФРОВАННОЙ
   (utils/encryption, ключ ENCRYPTION_KEY — тот же механизм, что у
   2FA-секретов; prod без валидного ключа не стартует, см.
   lib/security-preflight). Открытым текстом хранятся только имена
   схемы и роли: они не секрет — доступ даёт пароль, а не имя.

   UNIQUE(project_id): база на проект ровно одна. Повторный провижининг
   перевыдаёт пароль и ОБНОВЛЯЕТ строку, а не копит вторую запись —
   иначе непонятно, какая из них действующая.

   Идемпотентно, самовызов на импорте (стиль 091/094).
   ================================================================ */

export function runAppDatabasesMigration() {
  const projectsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()
  if (!projectsExists) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_databases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
      schema_name TEXT NOT NULL,
      db_role TEXT NOT NULL,
      connection_string_encrypted TEXT NOT NULL,
      /* Результат применения db/schema.sql приложения: 'applied' | 'failed' | 'empty'.
         Хранится, потому что «база выдана» и «таблицы приложения созданы» — разные
         факты, и выдавать одно за другое значило бы врать в отчёте. */
      schema_status TEXT,
      schema_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_app_databases_project ON app_databases(project_id)`)

  console.log("✅ Migration 096: app_databases ready (credentials encrypted at rest)")
}

runAppDatabasesMigration()
