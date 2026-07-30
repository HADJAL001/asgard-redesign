/* ================================================================
   OSGARD · Замер: чем платформа решает, какие уроки увидит модель
   (волна 7, п.3)
   ----------------------------------------------------------------
   ЗАЧЕМ. Доска утверждает две вещи: бесполезный урок набирал повторы и
   вытеснял рабочий, а «повторилось дважды» было абсолютным числом без
   знаменателя. Утверждение обязано быть числом, полученным ОДНИМ И ТЕМ ЖЕ
   скриптом на двух деревьях: «до» (main) и «после» (ветка).

   ЧТО ИЗМЕРЯЕТСЯ. Доля ситуаций, в которых платформа выбирает уроки так,
   как выбрал бы инженер, знающий факты. Каждая ситуация — настоящий
   корпус в настоящих таблицах (миграции 092/093/094/098): счётчики и
   свежесть в `generation_lessons`, генерации в `generation_learning`.
   Ответ даёт `selectPromptLessons`/`rankedLessons` ДЕРЕВА и ничего
   кроме них: ни одно поле, заведённое этой волной, в подсчёте не
   участвует — иначе это был бы самоотчёт.

   ПОЧЕМУ ЧИСЛО «ДО» НЕ НОЛЬ ПО ПОСТРОЕНИЮ. Шесть ситуаций из девяти —
   НЕГАТИВНЫЕ КОНТРОЛИ: правильный ответ там означает «ничего не менять».
   Главный из них требует доска дословно: полезный урок гейт НЕ
   выбрасывает. Метрика, у которой «до» равно нулю механически, не умеет
   поймать перегиб — а перегиб здесь опаснее слепоты: затухание,
   вычистившее сработавшие уроки, вернуло бы дефекты, которых уже не было.

   ЧЕСТНАЯ ПОБЛАЖКА «ДО». Все данные, которыми судит ветка, на main тоже
   ЛЕЖАТ: `last_seen` пишется с волны 2, журнал генераций — с волны 7 п.1.
   Main их просто не читает при отборе. Прятать эти данные от «до» было бы
   подтасовкой в свою пользу.

   ЧЕСТНЫЙ ПРЕДЕЛ. Прод-базы с этой машины не видно, взвесить ситуации
   реальным трафиком нечем: каждая идёт с весом 1. Это не прод-статистика
   и выдавать её за неё нельзя. Прод-числа даст витрина `/dev/memory`
   полями `faded` и `rateJudged` — ровно для этого они и заведены.

   ЗАПУСК ОДИНАКОВЫЙ НА ОБОИХ ДЕРЕВЬЯХ:
       npx tsx src/scripts/measure-lesson-selection.ts
   ================================================================ */

process.env.DB_PATH = ":memory:"

import type * as Corpus from "../lib/craft-corpus"

/* Всё, что зависит от схемы, — через `await import` внутри main: статический import
   поднялся бы выше миграций, и корпус увидел бы базу без колонок. */
let db: typeof import("../lib/db").default
let selectPromptLessons: typeof Corpus.selectPromptLessons
let rankedLessons: typeof Corpus.rankedLessons

/* Настоящие правила платформы (формулировки живут в craft-corpus:LESSON_TEXT).
   Выдуманное правило в промпт не попадает вовсе — замер измерял бы не то. */
const OLD = "use-client-missing"
const FRESH = "suspense-boundary-missing"
const FILLER = ["import-missing", "dependency-missing", "syntax", "markdown-leak", "empty-file"]

/* Шаг журнала: одна строка — одна генерация. «N генераций назад» выражается меткой
   времени, а не календарём: возраст дефекта меряется генерациями (см. lib/lesson-decay). */
const GEN_STEP_MS = 60_000
const NOW = 1_800_000_000_000
const stamp = (gensAgo: number) => NOW - gensAgo * GEN_STEP_MS

type Rule = {
  rule: string
  count: number
  /** Сколько генераций назад дефект встречался последний раз. */
  lastSeenGensAgo: number
  /** Точка отсчёта обучения: когда урок начал доходить до модели и с каким счётчиком. */
  taught?: { atGensAgo: number; occurrencesAt: number; times: number }
}

type Question =
  /** Какое правило уйдёт в промпт ПЕРВЫМ. */
  | { kind: "top1" }
  /** Попадёт ли правило в промпт из `limit` мест. */
  | { kind: "inPrompt"; rule: string; limit: number }
  /** Какой вердикт платформа выносит формулировке. */
  | { kind: "effect"; rule: string }

type Situation = {
  key: string
  what: string
  rules: Rule[]
  /** Сколько генераций в журнале. 0 — журнала нет: знаменателя не существует. */
  generations: number
  question: Question
  /** Правильный ответ, заданный ДО запуска. */
  expect: string
  why: string
  /** Негативный контроль: правильный ответ — «ничего не менять». */
  control?: true
}

const SITUATIONS: Situation[] = [
  {
    key: "fresh-beats-dead-history",
    what: "давний частый дефект (50 повторов, 160 генераций тишины) против свежего (5 повторов сейчас)",
    rules: [
      { rule: OLD, count: 50, lastSeenGensAgo: 160 },
      { rule: FRESH, count: 5, lastSeenGensAgo: 0 },
    ],
    generations: 200,
    question: { kind: "top1" },
    expect: FRESH,
    why: "промпт обязан предупреждать о том, что ломается, а не о том, что ломалось",
  },
  {
    key: "new-class-breaks-into-top",
    what: "шесть мест заняты мёртвой историей, новый класс дефекта ломает код прямо сейчас",
    rules: [
      { rule: OLD, count: 90, lastSeenGensAgo: 150 },
      ...FILLER.map((rule, i) => ({ rule, count: 80 - i * 5, lastSeenGensAgo: 150 + i })),
      { rule: FRESH, count: 6, lastSeenGensAgo: 0 },
    ],
    generations: 200,
    question: { kind: "inPrompt", rule: FRESH, limit: 6 },
    expect: "да",
    why: "топ, замороженный историей, не пускал к модели ни одного нового класса дефекта",
  },
  {
    key: "rate-verdict-large-traffic",
    what: "два повтора после урока — но за тысячу генераций",
    rules: [{ rule: OLD, count: 30, lastSeenGensAgo: 3, taught: { atGensAgo: 990, occurrencesAt: 28, times: 40 } }],
    generations: 1000,
    question: { kind: "effect", rule: OLD },
    expect: "unclear",
    why: "при растущем трафике улучшение не имеет права выглядеть как деградация",
  },
  {
    key: "small-traffic-still-condemns",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: два повтора за десять генераций",
    rules: [{ rule: OLD, count: 30, lastSeenGensAgo: 0, taught: { atGensAgo: 9, occurrencesAt: 28, times: 6 } }],
    generations: 10,
    question: { kind: "effect", rule: OLD },
    expect: "fails",
    why: "знаменатель не отменяет приговоров, он их уточняет: каждая пятая генерация — провал урока",
  },
  {
    key: "proven-not-evicted",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ ДОСКИ: сработавший урок (180 генераций тишины) против свежего шума",
    rules: [
      { rule: OLD, count: 30, lastSeenGensAgo: 180, taught: { atGensAgo: 190, occurrencesAt: 30, times: 12 } },
      ...FILLER.map((rule, i) => ({ rule, count: 9 - i, lastSeenGensAgo: 0 })),
    ],
    generations: 200,
    question: { kind: "inPrompt", rule: OLD, limit: 4 },
    expect: "да",
    why: "у сработавшего урока дефект прекращается по определению — затухание вычистило бы именно то, что работает",
  },
  {
    key: "idle-platform-remembers",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: журнал пуст — платформа простояла без генераций",
    rules: [
      { rule: OLD, count: 50, lastSeenGensAgo: 40_000 },
      { rule: FRESH, count: 5, lastSeenGensAgo: 0 },
    ],
    generations: 0,
    question: { kind: "top1" },
    expect: OLD,
    why: "месяц простоя не даёт ни одного факта ни за урок, ни против него",
  },
  {
    key: "frequency-still-wins",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: оба дефекта встречались только что, один ломает в двадцать раз чаще",
    rules: [
      { rule: OLD, count: 40, lastSeenGensAgo: 0 },
      { rule: FRESH, count: 2, lastSeenGensAgo: 0 },
    ],
    generations: 60,
    question: { kind: "top1" },
    expect: OLD,
    why: "затухание — поправка на свежесть, а не правило «кто новее, тот и прав»",
  },
  {
    key: "no-journal-behaves-as-before",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: знаменателя нет — вердикт обязан остаться абсолютным",
    rules: [{ rule: OLD, count: 30, lastSeenGensAgo: 3, taught: { atGensAgo: 990, occurrencesAt: 28, times: 40 } }],
    generations: 0,
    question: { kind: "effect", rule: OLD },
    expect: "fails",
    why: "накат кода без миграции не имеет права менять ни один вердикт",
  },
  {
    key: "failing-still-shown",
    control: true,
    what: "НЕГАТИВНЫЙ КОНТРОЛЬ: провалившаяся формулировка при свободных местах",
    rules: [{ rule: OLD, count: 30, lastSeenGensAgo: 0, taught: { atGensAgo: 40, occurrencesAt: 10, times: 12 } }],
    generations: 50,
    question: { kind: "inPrompt", rule: OLD, limit: 6 },
    expect: "да",
    why: "плохая формулировка всё же лучше пустого места",
  },
]

/* ---------------------------------------------------------------- */

/** Поднимает базу дерева настоящими миграциями и проверяет, что подняла именно ту. */
async function setUpTree() {
  ;({ default: db } = await import("../lib/db"))
  await import("../migrations/092_craft_corpus")
  await import("../migrations/093_lesson_authoring")
  await import("../migrations/094_generation_learning")
  await import("../migrations/098_lesson_teaching_baseline")
  ;({ selectPromptLessons, rankedLessons } = await import("../lib/craft-corpus"))

  const cols = (db.prepare(`PRAGMA table_info(generation_lessons)`).all() as Array<{ name: string }>).map((c) => c.name)
  for (const needed of ["last_seen", "taught_from", "occurrences_at_teaching", "taught_times"]) {
    if (!cols.includes(needed)) throw new Error(`нет колонки ${needed} — замер измерял бы не то дерево`)
  }
  const journal = db
    .prepare(`SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='generation_learning'`)
    .get() as { n: number }
  if (journal.n !== 1) throw new Error("нет журнала генераций (094) — знаменателя не существует ни на одном дереве")
}

function reset() {
  db.exec(`DELETE FROM generation_lessons; DELETE FROM generation_lesson_texts; DELETE FROM generation_learning;`)
}

function setUp(s: Situation) {
  for (const r of s.rules) {
    db.prepare(
      `INSERT INTO generation_lessons (rule, occurrences, last_seen, taught_from, occurrences_at_teaching, taught_times)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      r.rule,
      r.count,
      stamp(r.lastSeenGensAgo),
      r.taught ? stamp(r.taught.atGensAgo) : null,
      r.taught?.occurrencesAt ?? null,
      r.taught?.times ?? 0,
    )
  }
  const insert = db.prepare(
    `INSERT INTO generation_learning (project_id, depth, path, lessons_taught, lessons_learned, fingerprint, created_at)
     VALUES (?, 'quick', 'ai', 1, 1, 'f', ?)`,
  )
  for (let i = 0; i < s.generations; i += 1) insert.run(i + 1, stamp(s.generations - 1 - i))
}

/** Ответ дерева на вопрос ситуации. Считается ТОЛЬКО функциями отбора самого дерева. */
function answer(q: Question): string {
  if (q.kind === "top1") return selectPromptLessons(1)[0]?.rule ?? "(ничего)"
  if (q.kind === "inPrompt") {
    return selectPromptLessons(q.limit).some((l) => l.rule === q.rule) ? "да" : "нет"
  }
  return rankedLessons().find((l) => l.rule === q.rule)?.effect ?? "(нет урока)"
}

async function main() {
  await setUpTree()

  const rows = SITUATIONS.map((s) => {
    reset()
    setUp(s)
    const got = answer(s.question)
    return { ...s, got, ok: got === s.expect }
  })

  const total = rows.length
  const ok = rows.filter((r) => r.ok).length
  const controls = rows.filter((r) => r.control)
  const controlsOk = controls.filter((r) => r.ok).length
  const signal = rows.filter((r) => !r.control)
  const signalOk = signal.filter((r) => r.ok).length

  console.log("\n=== Отбор уроков в промпт: давление дефекта вместо счётчика (волна 7, п.3) ===\n")
  for (const r of rows) {
    console.log(
      `${r.ok ? "✔" : "✘"} ${r.control ? "[контроль] " : ""}${r.key}\n    ${r.what}\n    ожидание: ${r.expect}   получено: ${r.got}`,
    )
  }
  console.log(
    `\nИТОГО: ${ok} из ${total} ситуаций решены как решил бы инженер (${Math.round((ok / total) * 100)}%)` +
      `\n  ситуации, где нужен знаменатель или свежесть: ${signalOk} из ${signal.length}` +
      `\n  негативные контроли (правильный ответ — «ничего не менять»): ${controlsOk} из ${controls.length}\n`,
  )

  /* Ненулевой код выхода — только на провале НЕГАТИВНОГО контроля: слепота отбора это
     «до», а перегиб — поломка, и она не имеет права выглядеть как обычная цифра. */
  if (controlsOk < controls.length) process.exitCode = 1
}

void main()
