import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 019: гарантируем колонки transactions.item/counterparty
   ----------------------------------------------------------------
   В репозитории существуют два независимых скрипта создания схемы:
   scripts/init-db.ts (transactions с колонками item/counterparty,
   на которые рассчитывает весь текущий код — onboarding, artifacts,
   wallet, tcmarket и т.д.) и db/migrations/001_initial_schema.ts
   (более старая схема transactions с fee/external_tx_id/metadata,
   без item/counterparty). Если конкретная БД была инициализирована
   вторым путём, каждый INSERT INTO transactions (..., item,
   counterparty, ...) в реальном коде падает с "no column named item".
   Эта миграция добавляет недостающие колонки, ничего не удаляя.
   ================================================================ */

export function runEnsureTransactionsColumnsMigration() {
  const columns = (db.prepare(`PRAGMA table_info(transactions)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!columns.includes("item")) {
    db.prepare(`ALTER TABLE transactions ADD COLUMN item TEXT`).run()
  }
  if (!columns.includes("counterparty")) {
    db.prepare(`ALTER TABLE transactions ADD COLUMN counterparty TEXT`).run()
  }
}

runEnsureTransactionsColumnsMigration()
