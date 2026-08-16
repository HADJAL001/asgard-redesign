/* ================================================================
   OSGARD · Замер: доля генераций, участвующих в обучении (волна 7)
   ----------------------------------------------------------------
   ЗАЧЕМ. Волна 7 утверждает, что до неё большая часть генераций шла
   мимо обучения. Утверждение обязано быть числом, и число обязано быть
   получено ОДНИМ И ТЕМ ЖЕ скриптом на двух деревьях — «до» (main) и
   «после» (ветка). Иначе «стало лучше» проверить нечем.

   ЧТО ИМЕННО ИЗМЕРЯЕТСЯ, И ПОЧЕМУ ЭТО НЕ САМООТЧЁТ. Скрипт НЕ смотрит
   ни в журнал обучения, ни в какое-либо поле, которое волна 7 сама же и
   завела. Он подменяет `globalThis.fetch` и читает ТЕЛО ЗАПРОСА,
   реально уходящего провайдеру, — то есть наблюдает истину на проводе.
   Признак обучения один и составной: код, выданный пользователю в этой
   ситуации, рождён ответом модели на промпт, который содержал ТЕКУЩИЙ
   блок уроков. Обе половины обязательны. Первая версия стенда проверяла
   только «уроки ушли в промпт» — и записала в обучающиеся строку, где
   провайдер ответил отказом, а код собрался заменой строк: уроки ушли,
   пользователь их не увидел. Ни бухгалтерия ветки, ни её классификация
   путей в измерении не участвуют — их проверяют юнит-тесты, а не этот
   скрипт.

   ПОЧЕМУ ПОДМЕНА ИМЕННО СЕТИ. Всё, что решает исход, — сборка промпта и
   ключ кэша — остаётся настоящим кодом дерева. Подменён только внешний
   провайдер, которого в замере и не должно быть: измеряется маршрутизация
   знания, а не качество модели.

   ЗАПУСК ОДИНАКОВЫЙ НА ОБОИХ ДЕРЕВЬЯХ:
       npx tsx src/scripts/measure-learning-coverage.ts

   На main четвёртый аргумент `adaptTemplate` (уроки) отсутствует в
   сигнатуре, и JS его молча отбрасывает. Это сделано намеренно: замер
   даёт «до» максимальную поблажку — уроки ему ПЕРЕДАЮТСЯ, и он всё
   равно их не доставляет. Обратное (не передавать) было бы подтасовкой
   в свою пользу.

   ЧЕСТНЫЙ ПРЕДЕЛ ЗАМЕРА. Прод-базы с настоящими генерациями с этой
   машины не видно (бэкенд без шелла), поэтому взвесить ситуации по
   реальному трафику нечем. Скрипт считает долю по ИСЧЕРПЫВАЮЩЕМУ
   перечню различимых ситуаций выдачи кода, каждая с весом 1. Это не
   прод-статистика и выдавать её за прод-статистику нельзя. Настоящую
   прод-долю даст журнал `generation_learning` (миграция 094) — ровно
   для этого он и заведён; здесь измеряется то, что можно измерить до
   выката, и измеряется одинаково для «до» и «после».

   Ситуации «AI не сконфигурирован» в перечень НЕ включены осознанно: там
   модель не вызывается вообще, уроки не могут дойти ни в одной версии, и
   к разнице «до/после» эти строки отношения не имеют — включение их в
   знаменатель одинаково размывало бы обе стороны.
   ================================================================ */

/* Окружение выставляется ДО импортов: ai-router читает ключи в константы модуля на
   импорте, а не при вызове. Ключ один (DeepSeek) — Claude без ключа отваливается сам,
   не делая запроса, и цепочка остаётся короткой и предсказуемой. */
process.env.DB_PATH = ":memory:"
process.env.DEEPSEEK_API_KEY = "measurement-stub"
delete process.env.CLAUDE_API_KEY
delete process.env.ANTHROPIC_API_KEY
delete process.env.GROK_API_KEY
delete process.env.XAI_API_KEY

const LESSON_MARKER = "ВЫУЧЕННЫЕ УРОКИ"

/** Набор уроков «сейчас» и «прежний» — отличаются формулировкой того же правила
 *  (ровно то, что умеет делать волна 6, переписывая негодный урок). */
const LESSONS_NOW = [
  `${LESSON_MARKER} (не повторяй эти ошибки):`,
  '1. каждый файл с хуками начинай директивой "use client" на первой строке',
  "2. не объявляй одно имя дважды в одном файле",
].join("\n")

const LESSONS_BEFORE = [
  `${LESSON_MARKER} (не повторяй эти ошибки):`,
  '1. компоненты с состоянием помечай "use client"',
  "2. не объявляй одно имя дважды в одном файле",
].join("\n")

const TEMPLATE = {
  id: 1,
  theme: "tracker",
  nameSample: "Прежнее имя",
  description: "Прежнее описание",
  badge: "sparkles",
  manifest: [],
  files: [
    { path: "app/page.tsx", content: "export default function Page() { return <div>Прежнее имя</div> }" },
    { path: "app/layout.tsx", content: 'export const metadata = { title: "Прежнее имя" }' },
    { path: "README.md", content: "# Прежнее имя" },
  ],
  artifactTypes: [{ name: "Артефакт", type: "weapon" }],
} as any

/* Ответ «модели». Для адаптации шаблона нужен формат с маркерами секций, для остального
   достаточно кода: разбор арт-дирекции и манифеста на таком ответе честно не сойдётся и
   код возьмёт свои детерминированные значения — на измеряемое это не влияет. */
const ADAPT_REPLY = `===META===
{"description": "новое описание", "badge": "zap", "artifactNames": ["Меч"]}
===PAGE===
export default function Page() { return <div>Новое имя</div> }
===LAYOUT===
export const metadata = { title: "Новое имя" }
===README===
# Новое имя`

const CODE_REPLY = "```tsx\nexport default function Page() { return <div>ok</div> }\n```"

/* ---------------- Наблюдение на проводе ---------------- */

const seen: string[] = []
/** Когда true — провайдер «молчит» (HTTP 503): проверяем путь без модели. */
let silent = false

const realFetch = globalThis.fetch
globalThis.fetch = (async (_url: any, init: any) => {
  const body = JSON.parse(String(init?.body ?? "{}"))
  const prompt: string = body?.messages?.map((m: any) => m.content).join("\n") ?? ""
  seen.push(prompt)

  if (silent) return new Response("upstream unavailable", { status: 503 })

  const content = prompt.includes("===META===") ? ADAPT_REPLY : CODE_REPLY
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}) as typeof fetch

function beginSituation() {
  seen.length = 0
  silent = false
}

/** Дошёл ли ТЕКУЩИЙ набор уроков до модели в этой выдаче — истина с провода. */
function currentLessonsReachedModel(): boolean {
  return seen.some((prompt) => prompt.includes(LESSONS_NOW.split("\n")[1]))
}

/** Рождён ли отданный код ответом модели ИМЕННО СЕЙЧАС: не заменой строк, не кэшем,
 *  не статической заглушкой. `seen.length > 0` отсекает попадание в кэш одинаково на
 *  обоих деревьях — на main поля `cached` в ответе генератора ещё нет. */
function codeBornFromModel(source: string): boolean {
  return (source === "template-ai" || source === "ai") && seen.length > 0
}

/** Признак обучения целиком: уроки дошли до модели И её ответ стал кодом пользователя.
 *  Одного «уроки ушли в промпт» недостаточно — при отказе провайдера промпт уходит, а
 *  пользователь получает код, который уроков не видел. */
function taughtNow(source: string): boolean {
  return currentLessonsReachedModel() && codeBornFromModel(source)
}

type Row = {
  depth: "quick" | "standard" | "deep"
  situation: string
  /** Сколько промптов реально ушло провайдеру в этой выдаче. */
  prompts: number
  taught: boolean
  note: string
}

async function main() {
  const { adaptTemplate } = await import("../services/template-adapter")
  const { generateApp } = await import("../services/app-generator")

  const rows: Row[] = []
  let n = 0
  /** Уникальное имя — иначе ситуации делили бы кэш друг с другом и мерили не себя. */
  const uniq = () => `Замер ${++n}`

  /* --- quick: путь по умолчанию, бесплатный, основной трафик --- */

  beginSituation()
  {
    const r = await adaptTemplate(TEMPLATE, uniq(), "привычки", { lessons: LESSONS_NOW } as any)
    rows.push({
      depth: "quick",
      situation: "шаблон найден, модель отвечает",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}`,
    })
  }

  beginSituation()
  {
    silent = true
    const r = await adaptTemplate(TEMPLATE, uniq(), "привычки", { lessons: LESSONS_NOW } as any)
    rows.push({
      depth: "quick",
      situation: "шаблон найден, модель молчит",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source} — код родился заменой строк, модели не было`,
    })
  }

  beginSituation()
  {
    const r = await generateApp(uniq(), "привычки", { lessons: LESSONS_NOW })
    rows.push({
      depth: "quick",
      situation: "шаблона нет, кэш пуст",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}`,
    })
  }

  {
    /* Память платформы изменилась: кэш заполнен ПРЕЖНИМ набором уроков. Это и есть
       обычное состояние живой платформы — уроки меняются чаще, чем истекает суточный TTL. */
    const name = uniq()
    beginSituation()
    await generateApp(name, "привычки", { lessons: LESSONS_BEFORE })
    beginSituation()
    const r = await generateApp(name, "привычки", { lessons: LESSONS_NOW })
    rows.push({
      depth: "quick",
      situation: "шаблона нет, кэш от ПРЕЖНИХ уроков",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: seen.length === 0 ? `source=${r.source}, выдано из кэша прошлого знания` : `source=${r.source}`,
    })
  }

  {
    /* Кэш от того же набора: код рождён под текущими уроками, но сейчас модель не
       вызывалась. Считаем «не училась» — занижение одинаковое для обеих версий. */
    const name = uniq()
    beginSituation()
    await generateApp(name, "привычки", { lessons: LESSONS_NOW })
    beginSituation()
    const r = await generateApp(name, "привычки", { lessons: LESSONS_NOW })
    rows.push({
      depth: "quick",
      situation: "шаблона нет, кэш от ТЕХ ЖЕ уроков",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}, промптов сейчас не было`,
    })
  }

  /* --- standard: forceAi, шаблон не используется, кэш читается --- */

  beginSituation()
  {
    const r = await generateApp(uniq(), "привычки", { lessons: LESSONS_NOW })
    rows.push({
      depth: "standard",
      situation: "кэш пуст",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}`,
    })
  }

  {
    const name = uniq()
    beginSituation()
    await generateApp(name, "привычки", { lessons: LESSONS_BEFORE })
    beginSituation()
    const r = await generateApp(name, "привычки", { lessons: LESSONS_NOW })
    rows.push({
      depth: "standard",
      situation: "кэш от ПРЕЖНИХ уроков",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: seen.length === 0 ? `source=${r.source}, выдано из кэша прошлого знания` : `source=${r.source}`,
    })
  }

  {
    const name = uniq()
    beginSituation()
    await generateApp(name, "привычки", { lessons: LESSONS_NOW })
    beginSituation()
    const r = await generateApp(name, "привычки", { lessons: LESSONS_NOW })
    rows.push({
      depth: "standard",
      situation: "кэш от ТЕХ ЖЕ уроков",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}, промптов сейчас не было`,
    })
  }

  /* --- deep: forceAi + bypassCache, кэш не читается --- */

  beginSituation()
  {
    const r = await generateApp(uniq(), "привычки", { lessons: LESSONS_NOW, bypassCache: true })
    rows.push({
      depth: "deep",
      situation: "кэш пуст (и не читается)",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}`,
    })
  }

  {
    const name = uniq()
    beginSituation()
    await generateApp(name, "привычки", { lessons: LESSONS_BEFORE })
    beginSituation()
    const r = await generateApp(name, "привычки", { lessons: LESSONS_NOW, bypassCache: true })
    rows.push({
      depth: "deep",
      situation: "кэш от прежних уроков игнорируется",
      prompts: seen.length,
      taught: taughtNow(r.source),
      note: `source=${r.source}`,
    })
  }

  /* ---------------- Отчёт ---------------- */

  const taught = rows.filter((r) => r.taught).length
  const shareText = `${taught}/${rows.length} = ${Math.round((taught / rows.length) * 1000) / 10}%`

  console.log("")
  console.log("ЗАМЕР: доля ситуаций выдачи кода, в которых текущие уроки дошли до модели")
  console.log("(истина с провода: тело запроса провайдеру, а не бухгалтерия платформы)")
  console.log("")
  for (const r of rows) {
    console.log(
      `${r.taught ? "УЧИТСЯ    " : "не учится "} ${r.depth.padEnd(9)} ${r.situation.padEnd(38)} промптов: ${String(
        r.prompts,
      ).padEnd(3)} ${r.note}`,
    )
  }
  console.log("")
  console.log(`ИТОГО: ${shareText}`)
  console.log("")

  /* Самопроверка замера: перечень, в котором ВСЁ учится или НИЧТО не учится, ничего не
     измеряет — такой результат означает поломку стенда, а не итог. Ненулевая доля
     обязана сочетаться с ненулевым остатком; на любом из деревьев это выполняется. */
  if (taught === 0) console.log("ВНИМАНИЕ: ни одна ситуация не учится — проверь стенд, а не вывод")
  if (taught === rows.length) console.log("ВНИМАНИЕ: учатся все ситуации — стенд не различает случаи")

  /* Второй негативный контроль — на сам критерий: в перечне обязана быть строка, где
     уроки до модели дошли, а обучением она НЕ считается (отказ провайдера). Если такой
     строки нет, критерий выродился в «уроки ушли в промпт» и снова завышает долю. */
  const promptOnly = rows.filter((r) => r.prompts > 0 && !r.taught && !r.note.includes("промптов сейчас не было"))
  if (promptOnly.length === 0) {
    console.log("ВНИМАНИЕ: критерий выродился — нет ни одной строки «промпт ушёл, а обучения нет»")
  }

  globalThis.fetch = realFetch
}

main().catch((err) => {
  console.error("ЗАМЕР НЕ СОСТОЯЛСЯ:", err)
  process.exitCode = 1
})
