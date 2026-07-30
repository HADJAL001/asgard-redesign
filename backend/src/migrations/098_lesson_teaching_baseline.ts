import db from "../lib/db"
import { handwrittenLessonRules } from "../lib/craft-corpus"

/* ================================================================
   OSGARD · Миграция 098: точка отсчёта есть у КАЖДОГО урока
   ----------------------------------------------------------------
   ПРОБЛЕМА, КОТОРУЮ ЗАКРЫВАЕМ — найдена не в коде, а на проде.

   Волна 5 научилась мерить пользу урока: `occurrences_at_authoring`
   даёт точку отсчёта, разница с текущим счётчиком = сколько раз дефект
   повторился ПОСЛЕ того, как урок дошёл до модели. Волна 6 научилась
   реагировать на это измерение: бесполезный урок уступает место и
   переписывается. Оба механизма живые — и оба на проде ИНЕРТНЫ.

   Живая проверка 2026-07-30 показала цепочку целиком:
     `silent` пуст → у всех 13 боевых правил УЖЕ есть рукописный текст
     (LESSON_TEXT в lib/craft-corpus) → авторство волны 5 не срабатывает
     ни разу (`selfAuthored: 0`) → у рукописных точки отсчёта не
     существует (`repeatedAfterLearning = null`) → волне 6 нечего
     классифицировать → ревизия формулировок не запускается.
   Итог на витрине: `working: 0, failing: 0` — и это НАВСЕГДА, потому
   что измеримый цикл стартовал бы только с появлением НОВОГО правила
   без рукописной строки, а на боевом трафике его вероятность около нуля.

   То есть 100 % боевых уроков были неизмеримы, а «платформа умнеет»
   нельзя было показать числом. Причина ровно одна: рукописный урок
   появляется вместе с кодом, а не в событии, — момента, с которого
   можно считать, у него нет.

   ЧТО ДЕЛАЕМ. Даём точку отсчёта и рукописным. Три колонки на
   `generation_lessons` (счётчики правил, миграция 092):

     taught_from             INTEGER — момент (ms), когда правило ВПЕРВЫЕ
                             ушло в промпт с формулировкой. NULL = ещё не
                             уходило, судить не по чему (так и остаётся
                             у правил без формулировки — `silent`).
     occurrences_at_teaching INTEGER — счётчик повторов НА ЭТОТ момент.
                             Без него `taught_from` бесполезен: в
                             `generation_lessons` лежит один накопительный
                             `occurrences` без разбивки по времени, и
                             «сколько повторов после момента T» из одного
                             времени не вычисляется. Меру даёт снимок, а
                             время — объяснимость на витрине.
     taught_times            INTEGER — сколько раз урок реально дошёл до
                             модели после точки отсчёта. Это ЗРЕЛОСТЬ
                             измерения: ноль повторов у урока, который
                             модель видела один раз, ничего не доказывает.
                             Без этой колонки миграция мгновенно объявила
                             бы все 13 рукописных «доказанно работающими»
                             и закрепила бы за ними места в промпте — то
                             самое смешение «не измеряем» с «нуль
                             повторов», от которого волна 6 защищалась
                             отдельным состоянием `unmeasured`.

   ЗАПОЛНЕНИЕ СУЩЕСТВУЮЩИХ СТРОК (grandfather) — по источнику урока:

     · правило с ПРИНЯТЫМ машинным уроком (`generation_lesson_texts.text
       IS NOT NULL`): точка отсчёта уже измерена волной 5 — переносим её
       как есть (`occurrences_at_authoring`, время — `last_revised_at`
       либо `created_at`, чтобы ревизия волны 6 не потерялась). Пробег
       неизвестен → 0: урок вернётся в «идёт измерение» и наберёт
       доказательство заново. Обнуления измерения тут нет — снимок
       счётчика сохранён, теряется только право звать себя доказанным
       без пробега.

     · рукописное правило (список берётся ИЗ КОДА — словарь живёт там, в
       базе его нет): `taught_from = NOW()`, снимок = текущий
       `occurrences`. Это единственное честное действие: урок УЖЕ давно
       уходил в промпт, но сколько раз дефект повторился с тех пор —
       неизвестно и восстановлению не подлежит. Значит отсчёт начинается
       с момента миграции, а не задним числом.

     · правило БЕЗ формулировки (`silent`): не трогаем вовсе. Оно в
       промпт не попадает, обучения не было, и выдать момент миграции за
       начало обучения значило бы соврать в отчёте.

   Ничего не удаляет и не перезаписывает: только ALTER TABLE ADD COLUMN
   и UPDATE строк, у которых точки отсчёта не было (`taught_from IS
   NULL`). Повторный запуск — пустая операция: колонки проверяются PRAGMA,
   а UPDATE отфильтрован по NULL, поэтому уже начатое измерение миграция
   не сдвинет ни при перезапуске сервера, ни при откате-накате.

   Схема без 092 (нет `generation_lessons`) — не ошибка: тихо выходим,
   платформа работает как до волны 8. Падать нельзя, миграции идут на
   boot: улучшение памяти не имеет права унести сервер.
   ================================================================ */

export function runLessonTeachingBaselineMigration() {
  const lessonsTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'generation_lessons'`)
    .get() as { name: string } | undefined

  if (!lessonsTable) {
    console.log("⏭️  Migration 098: generation_lessons отсутствует — пропускаю (схема без 092)")
    return
  }

  const columns = new Set(
    (db.prepare(`PRAGMA table_info(generation_lessons)`).all() as Array<{ name: string }>).map((c) => c.name),
  )

  /* taught_from и occurrences_at_teaching — без DEFAULT: NULL здесь несёт смысл
     «точки отсчёта нет», и подменять его нулём нельзя (нуль повторов — это
     доказательство пользы, а «не измеряем» — его отсутствие). */
  if (!columns.has("taught_from")) {
    db.exec(`ALTER TABLE generation_lessons ADD COLUMN taught_from INTEGER`)
  }
  if (!columns.has("occurrences_at_teaching")) {
    db.exec(`ALTER TABLE generation_lessons ADD COLUMN occurrences_at_teaching INTEGER`)
  }
  /* Пробег, наоборот, с DEFAULT 0: «модель видела урок ноль раз» — полноценный
     факт, а NULL заставлял бы каждого читателя лечить его через COALESCE. */
  if (!columns.has("taught_times")) {
    db.exec(`ALTER TABLE generation_lessons ADD COLUMN taught_times INTEGER NOT NULL DEFAULT 0`)
  }

  addSupersedeFlag()

  const carried = carryOverAuthoredBaselines()
  const started = startHandwrittenBaselines()

  console.log(
    `✅ Migration 098: Lesson teaching baseline ready (перенесено машинных: ${carried}, начато рукописных: ${started})`,
  )
}

/**
 * Разрешает машинной формулировке заменить рукописную — но только когда та доказанно
 * не работает.
 *
 * Почему колонка, а не соглашение по `source`: приоритет рукописного текста в
 * `resolveLessonText` безусловен с волны 5, и снимать его целиком нельзя — выверенная
 * руками формулировка в среднем надёжнее машинной. Здесь нужно ровно одно точечное
 * исключение, и оно обязано быть ЯВНЫМ признаком в данных: тогда витрина может
 * показать, где именно платформа переспорила разработчика, а откат сводится к
 * `UPDATE ... SET supersedes_handwritten = 0`.
 *
 * DEFAULT 0: у всех существующих машинных уроков замены рукописного не было и быть не
 * могло (случай появился только в волне 8).
 */
function addSupersedeFlag(): void {
  const textsTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'generation_lesson_texts'`)
    .get() as { name: string } | undefined

  if (!textsTable) return // схема без 093 — машинных уроков не существует

  const cols = new Set(
    (db.prepare(`PRAGMA table_info(generation_lesson_texts)`).all() as Array<{ name: string }>).map((c) => c.name),
  )
  if (!cols.has("supersedes_handwritten")) {
    db.exec(`ALTER TABLE generation_lesson_texts ADD COLUMN supersedes_handwritten INTEGER NOT NULL DEFAULT 0`)
  }
}

/**
 * Переносит уже измеренную точку отсчёта машинных уроков (волна 5) в
 * `generation_lessons`, чтобы у измерения был ОДИН адрес.
 *
 * Держать точку отсчёта в двух таблицах — приглашение к расхождению: волна 6
 * сдвигает её при ревизии в `generation_lesson_texts`, и вторая копия начала бы
 * тихо врать. Поэтому здесь перенос, а не дублирование, — дальше все читатели
 * берут точку отсчёта из `generation_lessons`.
 */
function carryOverAuthoredBaselines(): number {
  const textsTable = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'generation_lesson_texts'`)
    .get() as { name: string } | undefined

  if (!textsTable) return 0 // схема без 093 — машинных уроков не существует

  const cols = new Set(
    (db.prepare(`PRAGMA table_info(generation_lesson_texts)`).all() as Array<{ name: string }>).map((c) => c.name),
  )
  /* База может быть без 097 (колонки ревизии). Тогда время берём по created_at:
     ревизий в такой базе не было, терять нечего. */
  const revisedAt = cols.has("last_revised_at") ? "t.last_revised_at" : "NULL"

  const result = db
    .prepare(
      `UPDATE generation_lessons SET
         taught_from = COALESCE(
           (SELECT COALESCE(${revisedAt}, t.created_at) FROM generation_lesson_texts t WHERE t.rule = generation_lessons.rule),
           taught_from
         ),
         occurrences_at_teaching = COALESCE(
           (SELECT t.occurrences_at_authoring FROM generation_lesson_texts t WHERE t.rule = generation_lessons.rule),
           occurrences_at_teaching
         )
       WHERE taught_from IS NULL
         AND rule IN (SELECT rule FROM generation_lesson_texts WHERE text IS NOT NULL)`,
    )
    .run()

  return result.changes
}

/**
 * Начинает отсчёт для рукописных уроков — тех, из-за которых витрина показывала
 * `working: 0, failing: 0` и показывала бы вечно.
 *
 * Список правил приходит ИЗ КОДА (`handwrittenLessonRules`), потому что рукописный
 * словарь живёт в `lib/craft-corpus`, а в базе его нет вовсе. Отличить в SQL
 * рукописное правило от правила без формулировки невозможно — а разница
 * принципиальная: первому точка отсчёта нужна, второму она была бы ложью.
 */
function startHandwrittenBaselines(): number {
  const rules = handwrittenLessonRules()
  if (rules.length === 0) return 0

  const now = Date.now()
  const update = db.prepare(
    `UPDATE generation_lessons SET
       taught_from = ?,
       occurrences_at_teaching = occurrences,
       taught_times = 0
     WHERE rule = ? AND taught_from IS NULL`,
  )

  /* Транзакция не ради скорости, а ради неделимости: половина правил с точкой
     отсчёта, половина без — это витрина, которая сравнивает несравнимое. */
  const apply = db.transaction((list: string[]) => {
    let changed = 0
    for (const rule of list) changed += update.run(now, rule).changes
    return changed
  })

  return apply(rules)
}

runLessonTeachingBaselineMigration()
