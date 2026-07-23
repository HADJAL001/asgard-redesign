import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 049: SERVICE BRIDGE (Интеграции)
   ================================================================
   integrations       — подключения пользователя к внешним сервисам
                         (коннектор + название + конфиг). Секретные
                         поля конфига (API-ключи, токены) хранятся
                         в config зашифрованными через utils/encryption.ts —
                         отдельной таблицы secrets не заводим.
   integration_logs    — журнал вызовов действий коннектора (тест
                         подключения и обычные вызовы) для дашборда
                         мониторинга и отладки пользователем.

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runServiceBridgeMigration() {
  console.log("[migration:049] Starting service_bridge migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS integrations (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER NOT NULL,
      connector_id     TEXT NOT NULL,
      name             TEXT NOT NULL,
      config           TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active',
      last_test_at     INTEGER,
      last_test_status TEXT,
      last_test_error  TEXT,
      created_at       INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS integration_logs (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      integration_id   INTEGER NOT NULL,
      user_id          INTEGER NOT NULL,
      action_id        TEXT NOT NULL,
      status           TEXT NOT NULL,
      duration_ms      INTEGER NOT NULL,
      request_summary  TEXT,
      response_summary TEXT,
      error_message    TEXT,
      created_at       INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_integration_logs_integration ON integration_logs(integration_id, created_at);
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_integration_logs_user ON integration_logs(user_id, created_at);
  `)

  console.log("[migration:049] service_bridge migration complete.")
}

if (require.main === module) {
  runServiceBridgeMigration()
}
