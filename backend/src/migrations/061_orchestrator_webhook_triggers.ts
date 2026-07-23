import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 061: orchestrator_webhook_triggers
   ----------------------------------------------------------------
   Phase 2 Service Bridge / Интеграции — входящий Webhook Trigger:
   узел "webhook_trigger" в графе оркестратора даёт внешнему сервису
   непредсказуемый URL (/wh/:token), POST на который запускает цепочку
   так же, как ручной запуск (то же списание TimeCoin через
   runChainForUser). Отдельной схемы проверки подписи не требуется —
   секретность самого token уже играет роль авторизации URL.
   ================================================================ */

export function runOrchestratorWebhookTriggersMigration() {
  console.log("[migration:061] Ensuring orchestrator_webhook_triggers table...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS orchestrator_webhook_triggers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chain_id          INTEGER NOT NULL,
      node_id           TEXT NOT NULL,
      user_id           INTEGER NOT NULL,
      token             TEXT NOT NULL UNIQUE,
      enabled           INTEGER NOT NULL DEFAULT 1,
      last_triggered_at INTEGER,
      trigger_count     INTEGER NOT NULL DEFAULT 0,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );
  `)

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_triggers_chain_node ON orchestrator_webhook_triggers(chain_id, node_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_triggers_token ON orchestrator_webhook_triggers(token);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_webhook_triggers_user ON orchestrator_webhook_triggers(user_id);`)

  console.log("[migration:061] Done.")
}

if (require.main === module) {
  runOrchestratorWebhookTriggersMigration()
}
