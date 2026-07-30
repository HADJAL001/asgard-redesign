import db from "./db"
import { captureError } from "./sentry"

/* ================================================================
   OSGARD · Доля генераций, участвующих в обучении (волна 7)
   ----------------------------------------------------------------
   ЗАЧЕМ ЭТОТ МОДУЛЬ СУЩЕСТВУЕТ. Память платформы (lib/craft-corpus)
   умела отвечать, ЧТО она выучила и какие уроки доходят до модели. Она
   не умела отвечать на вопрос, который решает всё: в какой ДОЛЕ
   генераций обучение вообще участвует.

   Разница не академическая. Уроки собираются в одну память, а получить
   код можно четырьмя разными путями, и до волны 7 два из них уроков не
   видели:

     ai            — полная AI-генерация: уроки в промпте каждого файла;
     ai-cached     — попадание в кэш готового результата: до волны 7
                     ключ кэша уроков не включал, поэтому сутки после
                     любого изменения памяти пользователь получал код,
                     рождённый под ПРОШЛЫМ набором;
     template-ai   — адаптация шаблона (глубина `quick`, путь по
                     умолчанию, то есть основной трафик): промпт
                     собирался без уроков вовсе;
     template-local — адаптация без модели (AI недоступен): уроков нет
                     и быть не может — переименование строк, не генерация;
     fallback      — статическая заглушка: то же самое.

   Отсюда правило этого модуля: обучающейся считается генерация, чей
   выданный пользователю код РОЖДЁН промптом с уроками. Не «уроки в
   памяти были», не «уроки могли бы дойти» — именно дошли.

   Второе направление считается отдельно: `lessons_learned` — сколько
   уроков генерация вернула в память. Смешивать их в одну цифру нельзя:
   генерация может учить платформу и при этом сама не учиться (ровно так
   вёл себя шаблонный путь — дефекты в память писал, уроков не получал).

   Все обращения к БД ленивые и проглатывают ошибку: измерение обучения
   не имеет права ронять генерацию (урок инцидента #59).
   ================================================================ */

/** Ветвь, которой генерация получила код. Совпадает с `source` наружу. */
export type GenerationPath = "ai" | "ai-cached" | "template-ai" | "template-local" | "fallback"

export type LearningLedgerEntry = {
  projectId: number
  depth: string
  path: GenerationPath
  /** Сколько уроков дошло до модели в этой генерации. 0 — генерация не училась. */
  lessonsTaught: number
  /** Сколько уроков генерация вернула в память платформы. */
  lessonsLearned: number
  /** Отпечаток набора уроков, под которым рождён выданный код (если рождён с ними). */
  fingerprint?: string | null
}

/**
 * Записывает след генерации в журнал обучения. Одна строка на проект: повторная
 * доработка перезаписывает её намеренно — журнал отвечает за ПОСЛЕДНЮЮ выдачу,
 * иначе доля считалась бы по истории, а не по тому, что у людей на руках.
 *
 * Никогда не бросает: схема без 094 обязана значить «измерения нет», а не
 * «генерация упала».
 */
export function recordGenerationLearning(entry: LearningLedgerEntry): void {
  try {
    db.prepare(
      `INSERT INTO generation_learning (project_id, depth, path, lessons_taught, lessons_learned, fingerprint, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         depth = excluded.depth,
         path = excluded.path,
         lessons_taught = excluded.lessons_taught,
         lessons_learned = excluded.lessons_learned,
         fingerprint = excluded.fingerprint,
         created_at = excluded.created_at`,
    ).run(
      entry.projectId,
      entry.depth,
      entry.path,
      Math.max(0, Math.round(entry.lessonsTaught)),
      Math.max(0, Math.round(entry.lessonsLearned)),
      entry.fingerprint ?? null,
      Date.now(),
    )
  } catch (err) {
    captureError("[learning-coverage] не удалось записать след обучения (схема без 094?):", err)
  }
}

/** Разрез доли: `key` — имя ветви или глубины, в зависимости от того, чем разрезали. */
export type CoverageSlice = {
  key: GenerationPath | string
  total: number
  taught: number
}

export type LearningCoverage = {
  /** Сколько генераций попало в измерение. */
  total: number
  /** Сколько из них получили код, рождённый промптом с уроками. */
  taught: number
  /** Сколько вернули уроки в память платформы. */
  learned: number
  /**
   * Доля обучающихся генераций, 0..1.
   *
   * `null` при нулевом `total` — и это не педантизм: «генераций ещё не было» и
   * «ни одна генерация не училась» — разные факты, а витрина, показавшая 0%
   * на пустой базе, сообщила бы о провале, которого нет.
   */
  taughtShare: number | null
  /** Доля генераций, вернувших уроки в память, 0..1 (или `null` на пустой базе). */
  learnedShare: number | null
  /** Разрез по ветвям получения кода — видно, какой именно путь не учится. */
  byPath: CoverageSlice[]
  /** Разрез по глубине — видно, беден ли обучением именно бесплатный путь. */
  byDepth: CoverageSlice[]
}

const EMPTY_COVERAGE: LearningCoverage = {
  total: 0,
  taught: 0,
  learned: 0,
  taughtShare: null,
  learnedShare: null,
  byPath: [],
  byDepth: [],
}

/** Доля с тремя знаками: витрине хватает, а сравнение «до/после» не тонет в шуме. */
function share(part: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((part / total) * 1000) / 1000
}

/**
 * Доля генераций, участвующих в обучении.
 *
 * `sinceDays` ограничивает окно: доля за всю историю платформы усредняет вместе
 * периоды до и после любой правки механизма и потому не годится для наблюдения за
 * регрессом — за окном в неделю регресс виден через неделю, а не через год.
 * Без параметра считается вся история.
 */
export function learningCoverage(options?: { sinceDays?: number }): LearningCoverage {
  const since =
    options?.sinceDays && options.sinceDays > 0 ? Date.now() - options.sinceDays * 24 * 60 * 60 * 1000 : null

  try {
    const where = since === null ? "" : "WHERE created_at >= ?"
    const params = since === null ? [] : [since]

    const totals = db
      .prepare(
        `SELECT COUNT(*) as total,
                COALESCE(SUM(CASE WHEN lessons_taught > 0 THEN 1 ELSE 0 END), 0) as taught,
                COALESCE(SUM(CASE WHEN lessons_learned > 0 THEN 1 ELSE 0 END), 0) as learned
         FROM generation_learning ${where}`,
      )
      .get(...params) as { total: number; taught: number; learned: number }

    const slice = (column: "path" | "depth"): CoverageSlice[] =>
      (
        db
          .prepare(
            `SELECT ${column} as key, COUNT(*) as total,
                    COALESCE(SUM(CASE WHEN lessons_taught > 0 THEN 1 ELSE 0 END), 0) as taught
             FROM generation_learning ${where}
             GROUP BY ${column} ORDER BY total DESC, key ASC`,
          )
          .all(...params) as Array<{ key: string; total: number; taught: number }>
      ).map((row) => ({ key: row.key, total: row.total, taught: row.taught }))

    return {
      total: totals.total,
      taught: totals.taught,
      learned: totals.learned,
      taughtShare: share(totals.taught, totals.total),
      learnedShare: share(totals.learned, totals.total),
      byPath: slice("path"),
      byDepth: slice("depth"),
    }
  } catch {
    return EMPTY_COVERAGE // схема без 094 — витрина честно пустая, а не выдуманная
  }
}
