import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 018: гарантируем таблицу wallets
   ----------------------------------------------------------------
   Таблица wallets создавалась только вручную через scripts/init-db.ts.
   На любой БД, где этот скрипт не запускался (в т.ч. потенциально на
   Railway после пересоздания volume), таблицы не существовало, а
   auth.controller.ts / user.model.ts молча глотали ошибку "wallets
   может не существовать" — из-за этого регистрация проходила успешно,
   но каждая денежная операция (онбординг, forge, покупки) падала с 500.
   Эта миграция запускается автоматически при каждом старте сервера,
   как и остальные, и добавляет недостающие wallets-строки существующим
   пользователям.
   ================================================================ */

export function runEnsureWalletsMigration() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wallets (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      credits REAL NOT NULL DEFAULT 0,
      shards REAL NOT NULL DEFAULT 0,
      crystals REAL NOT NULL DEFAULT 0,
      timecoin REAL NOT NULL DEFAULT 0,
      cash_usd REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)

  db.exec(`
    INSERT OR IGNORE INTO wallets (user_id, credits, shards, crystals, timecoin, cash_usd)
    SELECT id, 100, 0, 0, 0, 0 FROM users;
  `)
}

runEnsureWalletsMigration()
