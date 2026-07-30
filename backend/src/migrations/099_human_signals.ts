import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 099: человеческие сигналы качества
   ----------------------------------------------------------------
   ЗАЧЕМ. До этой миграции «хорошо» означало ровно одно —
   «скомпилировалось». Балл корпуса (`craftQuality`, craft-corpus.ts)
   складывался из балла интерфейса, вердикта сборки и числа ремонтов.
   Реакция живого человека не входила в него НИКАК, хотя это самый
   честный судья: компилятор проверяет, что код собрался, а человек —
   что им можно пользоваться.

   Данные уже были, их просто никто не слушал:
     • просьба переделать (`project_refinements`, миграция 089) —
       буквальное доказательство «мне это не подошло»;
     • успешный деплой (`projects.deploy_status='deployed'`,
       миграции 029/096) — человек понёс результат в прод, сильнее
       одобрения не бывает.

   ЧТО ДЕЛАЕМ. Даём этим сигналам дорогу в память платформы.

   1. `projects.corpus_hash` TEXT (nullable) — АДРЕС. Строка корпуса
      (`project_templates.hash`), в которую ушёл код именно этого
      проекта. Без адреса поздний сигнал некуда доставить: корпус
      ключуется темой, а не проектом, и «переделай» от проекта X
      било бы по случайному соседу. Ставится ТОЛЬКО когда генерация
      реально выиграла отбор и заняла строку — иначе связи нет.

   2. `project_templates.human_redos` INTEGER DEFAULT 0 — сколько раз
      человек просил переделать код этой строки корпуса.
   3. `project_templates.human_deploys` INTEGER DEFAULT 0 — сколько раз
      код этой строки уехал в прод.
   4. `project_templates.human_signal_at` INTEGER (nullable) — когда
      пришёл последний человеческий сигнал (для наблюдаемости: строка
      без сигналов и строка с сигналами — разные состояния, и их надо
      уметь отличать, а не гадать по нулям).

   Балл остаётся ПРОИЗВОДНЫМ: он не правится руками, а пересчитывается
   из сохранённых слагаемых (вердикт + интерфейс + ремонты + сигналы),
   поэтому число и объяснение разойтись не могут — приём миграций
   081/090/092.

   Grandfather: у существующих строк корпуса счётчики = 0, у проектов
   `corpus_hash` = NULL. Backfill НЕ делаем: приписать старому проекту
   адрес в корпусе, которого никто не записывал, значило бы соврать —
   темы и ключевые слова с тех пор могли смениться.

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте.
   ================================================================ */

export function runHumanSignalsMigration() {
  const projectsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`)
    .get()

  if (projectsExists) {
    const cols = (db.prepare(`PRAGMA table_info(projects)`).all() as Array<{ name: string }>).map((c) => c.name)
    if (!cols.includes("corpus_hash")) {
      db.exec(`ALTER TABLE projects ADD COLUMN corpus_hash TEXT`)
      console.log("✅ Migration 099: added projects.corpus_hash")
    }
  }

  const templatesExist = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='project_templates'`)
    .get()

  if (templatesExist) {
    const cols = (db.prepare(`PRAGMA table_info(project_templates)`).all() as Array<{ name: string }>).map(
      (c) => c.name,
    )
    if (!cols.includes("human_redos")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN human_redos INTEGER NOT NULL DEFAULT 0`)
      console.log("✅ Migration 099: added project_templates.human_redos")
    }
    if (!cols.includes("human_deploys")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN human_deploys INTEGER NOT NULL DEFAULT 0`)
      console.log("✅ Migration 099: added project_templates.human_deploys")
    }
    if (!cols.includes("human_signal_at")) {
      db.exec(`ALTER TABLE project_templates ADD COLUMN human_signal_at INTEGER`)
      console.log("✅ Migration 099: added project_templates.human_signal_at")
    }
  }

  console.log("✅ Migration 099: Human signals ready (legacy rows grandfathered)")
}

runHumanSignalsMigration()
