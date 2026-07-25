import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 080: «Провенанс и роялти творца»
   ----------------------------------------------------------------
   Замыкает правый нижний угол маховика созидания: ковка → ценность →
   мотив ковать ещё. Артефакт запоминает СВОЕГО ПЕРВОГО кузнеца
   (creator_id, иммутабельно), и при каждой последующей перепродаже
   творец получает долю комиссии (см. lib/creator-royalty.ts и
   routes/marketplace.routes.ts). Куёшь не ради разовой продажи, а
   ради актива, который платит тебе годами.

   Три части, все аддитивны и prod-safe:

   1. Колонка artifacts.creator_id (nullable, REFERENCES users).
      Иммутабельна: передача владения (UPDATE owner_id при продаже)
      её НЕ трогает — триггер ниже висит только на INSERT.

   2. Триггер провенанса trg_artifacts_creator_id: на КАЖДЫЙ INSERT,
      если creator_id не задан явно, проставляет creator_id = owner_id.
      Так провенанс ловится единой точкой во ВСЕХ путях ковки
      (генерация проекта, фьюжн, дропы, тир-ап дар, demo-convert)
      без правки маршрутного кода. `WHEN NEW.creator_id IS NULL`
      сохраняет явно переданного творца (будущая передача провенанса
      сквозь фьюжн). Рекурсии нет: триггер только на INSERT, а тело
      делает UPDATE.

   3. Честный backfill исторических артефактов: creator_id = owner_id
      ТОЛЬКО для тех, что никогда не продавались на маркетплейсе
      (доказуемо ещё у своего создателя). Реально торгованные остаются
      NULL — платить роялти «творцу», которого мы не знаем, нечестно,
      поэтому они просто не участвуют (royalty-гард это учитывает).

   Идемпотентно: ALTER под PRAGMA-guard, триггер DROP+CREATE, backfill
   бьёт только NULL, индекс IF NOT EXISTS. Самовызов на импорте (тот же
   стиль, что миграции 076/079).
   ================================================================ */

export function runCreatorProvenanceMigration() {
  const artifactsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()
  if (!artifactsExists) return

  // 1) Колонка creator_id (иммутабельный первый кузнец).
  const cols = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes("creator_id")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN creator_id INTEGER REFERENCES users(id)`)
    console.log("✅ Migration 080: added artifacts.creator_id")
  }

  // 2) Триггер провенанса — единая точка захвата творца при любой ковке.
  db.exec(`DROP TRIGGER IF EXISTS trg_artifacts_creator_id`)
  db.exec(`
    CREATE TRIGGER trg_artifacts_creator_id
    AFTER INSERT ON artifacts
    WHEN NEW.creator_id IS NULL
    BEGIN
      UPDATE artifacts SET creator_id = NEW.owner_id WHERE id = NEW.id;
    END
  `)

  // 3) Честный backfill: только неторгованные артефакты (creator = owner доказуем).
  const listingsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='marketplace_listings'`)
    .get()
  if (listingsExists) {
    db.exec(`
      UPDATE artifacts SET creator_id = owner_id
      WHERE creator_id IS NULL
        AND id NOT IN (SELECT artifact_id FROM marketplace_listings WHERE status = 'sold')
    `)
  } else {
    // Маркетплейса ещё нет → все существующие артефакты доказуемо у создателя.
    db.exec(`UPDATE artifacts SET creator_id = owner_id WHERE creator_id IS NULL`)
  }

  db.exec(`CREATE INDEX IF NOT EXISTS idx_artifacts_creator ON artifacts(creator_id)`)
  console.log("✅ Migration 080: creator provenance trigger + backfill ready")
}

runCreatorProvenanceMigration()
