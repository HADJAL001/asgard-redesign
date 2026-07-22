import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 046: WEBHOOKS
   ================================================================
   Таблица подписок на уведомления о завершении/ошибке задачи
   генерации проекта (ChainManager, services/chain-manager.ts).
   Регистрация — через routes/webhooks.routes.ts (CRUD от лица
   пользователя), рассылка — services/webhook.service.ts.

   secret — опциональный общий секрет для HMAC-подписи payload'а
   (заголовок X-Webhook-Signature), чтобы получатель мог проверить,
   что запрос действительно пришёл от OSGARD.

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS).
   ================================================================ */

export function runWebhooksMigration() {
  console.log("[migration:046] Starting webhooks migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      secret     TEXT,
      enabled    INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
  `)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhooks(user_id);
  `)

  console.log("[migration:046] webhooks migration complete.")
}

if (require.main === module) {
  runWebhooksMigration()
}
