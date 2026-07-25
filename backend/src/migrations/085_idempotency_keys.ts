import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 085: IDEMPOTENCY KEYS (экономика без двойных списаний)
   ================================================================
   Аудит показал: все денежные ручки (forge, marketplace, wallet-transfer,
   auctions, stakes, drops, jarvis-shop) выполняют «проверка баланса →
   списание → побочные вставки» ОТДЕЛЬНЫМИ не-транзакционными стейтментами.
   Два системных дефекта:

     1) НЕатомарность: краш/исключение между списанием и вставкой артефакта
        оставляет частичное состояние (деньги ушли, товара нет — или наоборот).
        Лечится обёрткой мутаций в ОДНУ better-sqlite3 db.transaction().

     2) Отсутствие идемпотентности: повторная доставка запроса (ретрай сети,
        двойной клик, повтор мобильным клиентом) = ДВОЙНОЕ списание. Классика
        TOCTOU + at-least-once доставки. Лечится ключом идемпотентности:
        клиент шлёт стабильный Idempotency-Key, сервер записывает результат
        первой успешной операции и при повторе с тем же ключом ВОЗВРАЩАЕТ
        сохранённый ответ, не трогая деньги повторно.

   Эта таблица — хранилище (2). Одна изолированная таблица, ничего
   существующего не трогаем. Запись ключа кладётся В ТОЙ ЖЕ транзакции,
   что и списание (см. lib/economy-tx.ts), поэтому «отмечено как сделанное»
   и «деньги перемещены» коммитятся атомарно — split-brain невозможен.

   Уникальность (user_id, scope, idem_key): один и тот же ключ у одного
   юзера в рамках одной ручки (scope) = одна операция. Разные ручки могут
   переиспользовать один клиентский ключ, не мешая друг другу.

   response_json — сериализованный успешный ответ ручки для точного повтора
   (тот же artifact.id, тот же баланс), чтобы клиент не различал первый вызов
   и ретрай. status фиксирует состояние: сейчас пишем только 'completed'
   (запись атомарна с коммитом), поле оставлено для будущих in-flight-локов.

   Безопасна для повторного запуска (CREATE TABLE/INDEX IF NOT EXISTS).
   Самовызов при импорте (как 080-084).
   ================================================================ */

export function runIdempotencyKeysMigration() {
  console.log("[migration:085] Starting idempotency_keys migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      scope         TEXT NOT NULL,
      idem_key      TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'completed'
                    CHECK(status IN ('completed')),
      response_json TEXT NOT NULL DEFAULT '{}',
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  // Ядро гарантии: (user, ручка, ключ) уникальны. Повторный INSERT того же
  // ключа падает по UNIQUE — economy-tx ловит это и отдаёт сохранённый ответ.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique
    ON idempotency_keys(user_id, scope, idem_key);
  `)

  console.log("[migration:085] idempotency_keys migration complete.")
}

// Самовызов на импорте: side-effect `import "./migrations/085_idempotency_keys"`
// в server.ts выполняет миграцию при старте. Идемпотентно, безопасно при повторе.
runIdempotencyKeysMigration()
