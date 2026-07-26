import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 092: корпус ремесла (платформа учится на себе)
   ----------------------------------------------------------------
   ПРОБЛЕМА, КОТОРУЮ ЗАКРЫВАЕМ. Хранилище шаблонов (services/
   template-store.ts) задумывалось как память платформы: успешная
   генерация сохраняется и переиспользуется для следующих проектов
   той же темы. На деле «память» работала против качества:

     1. Шаблон писался СРАЗУ после ответа модели — до единой проверки.
        В корпус попадал непроверенный код, и следующие проекты
        наследовали его дефекты.
     2. `ON CONFLICT(hash) DO NOTHING` — первая генерация темы
        фиксировалась НАВСЕГДА. Более удачная позже уже не могла её
        заменить: корпус не улучшался в принципе.
     3. Выбор шаблона шёл по `usage_count` — по популярности, а не по
        качеству. Часто используемый плохой шаблон вытеснял редкий
        хороший.

   ЧТО ДЕЛАЕМ. Корпус получает измеримое качество и право на замену:
   в него попадает только код, прошедший инженерный контур (миграция
   091), с баллом, производным от вердикта сборки и качества интерфейса.
   Лучший вытесняет худшего — это отбор, а не накопление.

   Плюс отдельная память ошибок: `generation_lessons` копит, на каких
   именно правилах ломается генерация чаще всего. Топ этих правил
   подмешивается в промпт КАЖДОЙ следующей генерации («выученные
   уроки») — платформа перестаёт повторять собственные ошибки.

   Аддитивные колонки в `project_templates`:
     quality_score INTEGER — 0..100, производный балл корпуса;
     verdict       TEXT    — инженерный вердикт кода шаблона;
     design_score  INTEGER — балл интерфейса на момент сохранения;
     repairs       INTEGER — сколько ремонтов потребовалось коду.

   Новая изолированная таблица `generation_lessons` (rule → счётчик).
   Ничего существующего не мутирует. Grandfather: у старых шаблонов
   quality_score = NULL — они считаются худшими из известных и будут
   вытеснены первой же проверенной генерацией той же темы.

   Идемпотентно: PRAGMA-guard + IF NOT EXISTS. Самовызов на импорте.
   ================================================================ */

export function runCraftCorpusMigration() {
  const templatesExist = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='project_templates'`)
    .get()

  if (templatesExist) {
    const cols = (db.prepare(`PRAGMA table_info(project_templates)`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    )

    if (!cols.includes("quality_score")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN quality_score INTEGER`)
      console.log("✅ Migration 092: added project_templates.quality_score")
    }
    if (!cols.includes("verdict")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN verdict TEXT`)
      console.log("✅ Migration 092: added project_templates.verdict")
    }
    if (!cols.includes("design_score")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN design_score INTEGER`)
      console.log("✅ Migration 092: added project_templates.design_score")
    }
    if (!cols.includes("repairs")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN repairs INTEGER`)
      console.log("✅ Migration 092: added project_templates.repairs")
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_lessons (
      rule        TEXT PRIMARY KEY,
      occurrences INTEGER NOT NULL DEFAULT 0,
      last_seen   INTEGER NOT NULL
    );
  `)

  console.log("✅ Migration 092: Craft corpus ready (quality-ranked templates + lessons memory)")
}

runCraftCorpusMigration()
