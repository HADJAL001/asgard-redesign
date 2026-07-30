/* ================================================================
   OSGARD · Замер: видит ли платформа заявку ДО генерации (волна 7, п.4)
   ----------------------------------------------------------------
   ЗАЧЕМ. Доска утверждает: до кодогенерации у платформы не было
   ничего — `detectTheme` (словарь восьми настроений), `findBestTemplate`
   (хэш темы + балл качества) и проверка «имя ИЛИ идея непусты».
   Утверждение обязано быть числом на размеченном корпусе, а не словами
   «стало лучше».

   ПОЧЕМУ ОДИН ПРОГОН ДАЁТ И «ДО», И «ПОСЛЕ». Прибор «до» — это
   `detectTheme` из services/template-store, и он лежит НЕТРОНУТЫМ на
   обоих деревьях: волна 4 его не меняла. Поэтому скрипт считает оба
   числа сразу, а запуск на main служит сверкой: число «до» обязано
   совпасть до цифры. Если не совпало — мерили не то дерево.
       на main:   npx tsx src/scripts/measure-preflight.ts   (только «до»)
       в ветке:   npx tsx src/scripts/measure-preflight.ts   («до» и «после»)

   ЧТО ИЗМЕРЯЕТСЯ — ровно три вопроса доски:
     A. ЧТО ЗА ПРОДУКТ. Способность различать продукты: пары заявок,
        про которые заранее объявлено «тот же продукт» / «разные».
        Тема здесь не ноль по построению — она права всякий раз, когда
        настроение совпало с продуктом, и именно это делает сравнение
        честным.
     B. НА ЧТО ЭТО ПОХОЖЕ. Поиск похожих прошлых генераций в
        размеченном корпусе: похожие «до» — с той же темой, «после» —
        того же класса. Правильный ответ задан заранее для каждой
        заявки, включая ДВЕ заявки, для которых правильный ответ —
        «похожих нет»: прибор, который всегда что-то находит, обязан
        на них провалиться.
     C. ЧТО НЕ ОПРЕДЕЛЕНО. Есть ли платформе о чём предупредить.
        Прибор «до» здесь существует: пустую заявку роут отклоняет.
        Четыре из двенадцати случаев — НЕГАТИВНЫЕ КОНТРОЛИ, где
        правильный ответ «предупреждать не о чем»; «до» проходит их
        молчанием, и обязан проходить «после» — иначе взгляд наперёд
        превратится в придирки к каждой заявке.

   ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ ПРОЦЕНТОМ. «Показывала ли платформа ответ
   человеку до кнопки» — не метрика, а факт кода: не показывала вовсе,
   первый взгляд модели на заявку был внутри генерации
   (app-generator.ts:193). Изображать это долей «0%» нечестно: ноль по
   построению ничего не измеряет.

   ЧЕСТНЫЙ ПРЕДЕЛ. Корпус здесь размеченный, а не прод: чтобы считать
   правильные ответы, их надо знать заранее, а прод-базы с этой машины
   не видно. Каждый случай идёт с весом 1 — это не прод-статистика и
   выдавать её за неё нельзя. Прод-числа даёт витрина `/dev/memory`
   полем `foresight`: у скольких проектов класс выведен и по скольким
   классам фактов хватает на вывод.
   ================================================================ */

process.env.DB_PATH = ":memory:"

import type * as TemplateStore from "../services/template-store"
import type * as ProductClass from "../lib/product-class"
import type * as Preflight from "../lib/generation-preflight"

let detectTheme: typeof TemplateStore.detectTheme
let classifyProduct: typeof ProductClass.classifyProduct | null = null
let findBriefGaps: typeof Preflight.findBriefGaps | null = null

/** Разметка: настоящий продукт заявки. Мой ярлык, поставленный руками ДО прогона, —
 *  намеренно не совпадает по написанию ни с темами, ни с классами кода, чтобы разметку
 *  нельзя было спутать с ответом прибора. */
type TrueProduct = "shop" | "chat" | "feed" | "dashboard" | "booking" | "tracker" | "game" | "showcase" | "none"

type Brief = { id: string; name: string; hint: string; truth: TrueProduct }

/* ---------------- корпус прошлых генераций (часть B) ---------------- */

const CORPUS: Brief[] = [
  { id: "к1", name: "Лавка редкостей", hint: "магазин артефактов с каталогом, корзиной и оплатой", truth: "shop" },
  { id: "к2", name: "Космо-маркет", hint: "магазин запчастей для звездолётов, каталог и оплата", truth: "shop" },
  { id: "к3", name: "Драконий чат", hint: "сообщения в реальном времени между участниками, вход по паролю", truth: "chat" },
  { id: "к4", name: "Командная болталка", hint: "чат с сообщениями онлайн и профилями", truth: "chat" },
  { id: "к5", name: "Лента новостей района", hint: "публикации, статьи, комментарии", truth: "feed" },
  { id: "к6", name: "Журнал путешествий", hint: "блог со статьями и фото", truth: "feed" },
  { id: "к7", name: "Панель продаж", hint: "графики и метрики, отчёт по неделям", truth: "dashboard" },
  { id: "к8", name: "Аналитика склада", hint: "дашборд с диаграммами и метриками", truth: "dashboard" },
  { id: "к9", name: "Запись к мастеру", hint: "календарь, слоты, бронирование, напоминания", truth: "booking" },
  { id: "к10", name: "Расписание тренировок", hint: "календарь занятий и записи на слот", truth: "booking" },
  { id: "к11", name: "Трекер привычек", hint: "список записей, задачи, учёт по дням", truth: "tracker" },
  { id: "к12", name: "Игровой мир драконов", hint: "уровни, очки, бои, лидерборд", truth: "game" },
]

/** Новые заявки. Правильный ответ — множество похожих из корпуса, объявленное ДО прогона. */
const ASKS: Brief[] = [
  { id: "з1", name: "Магазин зелий", hint: "каталог зелий, корзина, оплата картой", truth: "shop" },
  { id: "з2", name: "Совет драконов", hint: "чат для обсуждений в реальном времени", truth: "chat" },
  { id: "з3", name: "Городская лента", hint: "посты и комментарии жителей", truth: "feed" },
  { id: "з4", name: "Панель показателей", hint: "графики и метрики по продажам", truth: "dashboard" },
  { id: "з5", name: "Бронь столиков", hint: "календарь, слоты, бронирование", truth: "booking" },
  { id: "з6", name: "Учёт инструментов", hint: "список записей и задачи по инвентарю", truth: "tracker" },
  { id: "з7", name: "Арена героев", hint: "уровни, очки, бои", truth: "game" },
  { id: "з8", name: "Космический магазин", hint: "каталог товаров и оплата", truth: "shop" },
  /* Два контроля: похожих в корпусе нет, и правильный ответ — пустой список. */
  { id: "з9-контроль", name: "Мир магии", hint: "фэнтези, драконы, красивая тьма", truth: "none" },
  { id: "з10-контроль", name: "Инструмент импорта", hint: "импорт и экспорт файлов, синхронизация", truth: "showcase" },
]

/* ---------------- пары на различимость (часть A) ---------------- */

type Pair = { id: string; what: string; a: Brief; b: Brief; same: boolean }

const brief = (name: string, hint: string, truth: TrueProduct): Brief => ({ id: name, name, hint, truth })

const PAIRS: Pair[] = [
  {
    id: "п1",
    what: "два магазина одной темы",
    a: brief("Лавка редкостей", "магазин артефактов с каталогом и оплатой", "shop"),
    b: brief("Космо-маркет", "магазин запчастей, каталог и оплата", "shop"),
    same: true,
  },
  {
    id: "п2",
    what: "чат и магазин — темы тоже разные",
    a: brief("Драконий чат", "сообщения в реальном времени, вход по паролю", "chat"),
    b: brief("Драконий базар", "магазин с каталогом и корзиной", "shop"),
    same: false,
  },
  {
    id: "п3",
    what: "два магазина, но настроения разные: у одного «робот», у другого «маркет»",
    a: brief("Космический маркет запчастей", "каталог и оплата", "shop"),
    b: brief("Робот-склад", "витрина товаров и оплата", "shop"),
    same: true,
  },
  {
    id: "п4",
    what: "чат и игра под ОДНОЙ темой «фэнтези»",
    a: brief("Драконий чат", "сообщения в реальном времени", "chat"),
    b: brief("Мир драконов", "уровни, очки, бои", "game"),
    same: false,
  },
  {
    id: "п5",
    what: "две панели показателей",
    a: brief("Панель продаж", "графики и метрики", "dashboard"),
    b: brief("Аналитика склада", "дашборд с диаграммами", "dashboard"),
    same: true,
  },
  {
    id: "п6",
    what: "две витрины-страницы",
    a: brief("Портфолио фотографа", "лендинг с галереей", "showcase"),
    b: brief("Резюме дизайнера", "страница-визитка", "showcase"),
    same: true,
  },
  {
    id: "п7",
    what: "учёт записей и запись на приём — обе без темы вовсе",
    a: brief("Трекер привычек", "список записей и задачи", "tracker"),
    b: brief("Запись к мастеру", "календарь, слоты, бронирование", "booking"),
    same: false,
  },
  {
    id: "п8",
    what: "две ленты материалов",
    a: brief("Лента новостей", "публикации и комментарии", "feed"),
    b: brief("Журнал", "блог со статьями", "feed"),
    same: true,
  },
  {
    id: "п9",
    what: "магазин и панель показателей",
    a: brief("Магазин", "каталог и оплата", "shop"),
    b: brief("Панель", "графики и метрики", "dashboard"),
    same: false,
  },
  {
    id: "п10",
    what: "магазин и игра, обе «фэнтези»",
    a: brief("Фэнтези-магазин", "каталог, корзина, оплата", "shop"),
    b: brief("Фэнтези-игра", "уровни, очки, бои", "game"),
    same: false,
  },
]

/* ---------------- заявки на пробелы (часть C) ---------------- */

type GapCase = {
  id: string
  name: string
  hint: string
  /** Есть ли платформе о чём предупредить. Объявлено ДО прогона. */
  warn: boolean
  /** Чего именно мы ждём — печатается рядом с ответом, чтобы разметку можно было оспорить. */
  why: string
  control?: true
}

const GAP_CASES: GapCase[] = [
  { id: "р1", name: "", hint: "", warn: true, why: "заявки нет вовсе" },
  { id: "р2", name: "Мир магии", hint: "фэнтези, драконы, красиво", warn: true, why: "описан вид, а не работа" },
  { id: "р3", name: "Магазин", hint: "магазин с оплатой картой", warn: true, why: "деньги без входа, цена не названа" },
  { id: "р4", name: "Чат", hint: "чат офлайн без интернета, сообщения в реальном времени", warn: true, why: "живой поток и работа без сети противоречат друг другу" },
  { id: "р5", name: "Личный кабинет читателя", hint: "мои статьи и лента публикаций", warn: true, why: "речь о личном, вход не назван" },
  { id: "р6", name: "Сервис бронирования", hint: "бронирование", warn: true, why: "почти всё придётся домыслить" },
  { id: "р7", name: "Соцсеть", hint: "профили, лента, комментарии", warn: true, why: "коротко, и профили без входа" },
  { id: "р8", name: "Витрина", hint: "красивый минимализм, тёмная тема", warn: true, why: "одни декорации" },
  {
    id: "р9-контроль",
    name: "Лавка",
    hint: "интернет-магазин с каталогом товаров, корзиной, оплатой, цена в рублях, вход по паролю",
    warn: false,
    why: "названы предмет, деньги, цена и вход — предупреждать не о чем",
    control: true,
  },
  {
    id: "р10-контроль",
    name: "Панель показателей",
    hint: "дашборд с графиками, метриками и отчётами по продажам, вход по паролю, роли администратора",
    warn: false,
    why: "показатели, вход и роли названы",
    control: true,
  },
  {
    id: "р11-контроль",
    name: "Игра про драконов",
    hint: "уровни, очки, бои, лидерборд, профили игроков, вход по паролю",
    warn: false,
    why: "игровому циклу список сущностей не обязателен",
    control: true,
  },
  {
    id: "р12-контроль",
    name: "Учёт заказов",
    hint: "список записей о заказах, задачи, оплата, вход по паролю, цена в рублях",
    warn: false,
    why: "предмет, деньги, цена и вход названы",
    control: true,
  },
]

/* ---------------- приборы ---------------- */

/** «До»: единственный ответ платформы на «что это» — тема. */
const themeOf = (b: Brief) => detectTheme(b.name, b.hint).theme

/** «После»: класс продукта. `null` — прибора в дереве нет (main). */
const classOf = (b: Brief) => (classifyProduct ? classifyProduct(b.name, b.hint).cls : null)

type Verdict = { ok: number; total: number }
const pct = (v: Verdict) => (v.total === 0 ? "—" : `${Math.round((v.ok / v.total) * 100)}%`)

/* ---------------- A. различимость продукта ---------------- */

function measurePairs(answer: (b: Brief) => string | null) {
  const all: Verdict = { ok: 0, total: 0 }
  const rows: string[] = []

  for (const p of PAIRS) {
    const a = answer(p.a)
    const b = answer(p.b)
    if (a === null || b === null) continue
    /* «Не знаю» с двух сторон — не ответ «одно и то же»: неопределённость не равна себе. */
    const said = a === b && a !== "unknown"
    const ok = said === p.same
    all.total += 1
    if (ok) all.ok += 1
    rows.push(`  ${ok ? "✔" : "✘"} ${p.id} ${p.what}\n      ждали: ${p.same ? "один продукт" : "разные"}   ответ: ${a} / ${b}`)
  }

  return { all, rows }
}

/* ---------------- B. поиск похожих прошлых генераций ---------------- */

function measureSimilar(answer: (b: Brief) => string | null) {
  const exact: Verdict = { ok: 0, total: 0 }
  const controls: Verdict = { ok: 0, total: 0 }
  let foundTotal = 0
  let foundRight = 0
  let truthTotal = 0
  const rows: string[] = []

  for (const ask of ASKS) {
    const key = answer(ask)
    if (key === null) continue

    /* Правильный ответ — по РАЗМЕТКЕ, а не по ответу прибора: похожие те, у кого тот же
       настоящий продукт. Для `none` правильный ответ — пустой список. */
    const truth = ask.truth === "none" ? [] : CORPUS.filter((c) => c.truth === ask.truth)
    const found = key === "unknown" ? [] : CORPUS.filter((c) => answer(c) === key)

    const right = found.filter((f) => truth.some((t) => t.id === f.id))
    foundTotal += found.length
    foundRight += right.length
    truthTotal += truth.length

    const ok = found.length === truth.length && right.length === truth.length
    exact.total += 1
    if (ok) exact.ok += 1
    if (ask.id.includes("контроль")) {
      controls.total += 1
      if (ok) controls.ok += 1
    }

    rows.push(
      `  ${ok ? "✔" : "✘"} ${ask.id} «${ask.name}»\n` +
        `      ждали: ${truth.length === 0 ? "похожих нет" : truth.map((t) => t.id).join(", ")}` +
        `   нашли: ${found.length === 0 ? "ничего" : found.map((f) => f.id).join(", ")}   (ключ: ${key})`,
    )
  }

  return {
    exact,
    controls,
    precision: foundTotal === 0 ? null : Math.round((foundRight / foundTotal) * 100),
    recall: truthTotal === 0 ? null : Math.round((foundRight / truthTotal) * 100),
    rows,
  }
}

/* ---------------- C. предупреждения о неопределённом ---------------- */

/** «До»: единственная проверка платформы — роут отклонял заявку, где и имя, и идея пусты. */
const warnedBefore = (c: GapCase) => !c.name.trim() && !c.hint.trim()

function measureGaps(warned: (c: GapCase) => boolean, kinds?: (c: GapCase) => string[]) {
  const all: Verdict = { ok: 0, total: 0 }
  const controls: Verdict = { ok: 0, total: 0 }
  const rows: string[] = []

  for (const c of GAP_CASES) {
    const said = warned(c)
    const ok = said === c.warn
    all.total += 1
    if (ok) all.ok += 1
    if (c.control) {
      controls.total += 1
      if (ok) controls.ok += 1
    }
    const detail = kinds ? `   [${kinds(c).join(", ") || "нет пробелов"}]` : ""
    rows.push(
      `  ${ok ? "✔" : "✘"} ${c.id} «${c.name || "(пусто)"}»\n` +
        `      ждали: ${c.warn ? "предупредить" : "молчать"} — ${c.why}\n` +
        `      ответ: ${said ? "предупредил" : "промолчал"}${detail}`,
    )
  }

  return { all, controls, rows }
}

/* ---------------- прогон ---------------- */

async function main() {
  ;({ detectTheme } = await import("../services/template-store"))

  /* Прибора «после» на main нет — и это нормально: скрипт обязан запускаться в обоих
     деревьях, иначе число «до» нечем сверить. */
  try {
    ;({ classifyProduct } = await import("../lib/product-class"))
    ;({ findBriefGaps } = await import("../lib/generation-preflight"))
  } catch {
    console.log("ℹ прибора «после» в этом дереве нет (main) — считаем только «до»\n")
  }

  console.log("=== Видит ли платформа заявку до генерации (волна 7, п.4) ===")

  /* --- A --- */
  const pairsBefore = measurePairs(themeOf)
  const pairsAfter = classifyProduct ? measurePairs(classOf) : null

  console.log(`\n--- A. Что за продукт: различимость на ${PAIRS.length} парах ---`)
  console.log(`\n«ДО» — тема (detectTheme): ${pairsBefore.all.ok}/${pairsBefore.all.total} = ${pct(pairsBefore.all)}`)
  pairsBefore.rows.forEach((r) => console.log(r))
  if (pairsAfter) {
    console.log(`\n«ПОСЛЕ» — класс продукта: ${pairsAfter.all.ok}/${pairsAfter.all.total} = ${pct(pairsAfter.all)}`)
    pairsAfter.rows.forEach((r) => console.log(r))
  }

  /* --- B --- */
  const simBefore = measureSimilar(themeOf)
  const simAfter = classifyProduct ? measureSimilar(classOf) : null

  console.log(`\n--- B. На что похоже: поиск в корпусе из ${CORPUS.length} прошлых генераций ---`)
  console.log(
    `\n«ДО» — похожие ищутся по теме: ${simBefore.exact.ok}/${simBefore.exact.total} заявок разобраны верно = ${pct(simBefore.exact)}` +
      `\n    точность найденного: ${simBefore.precision}%   полнота: ${simBefore.recall}%` +
      `\n    контроли «похожих нет»: ${simBefore.controls.ok}/${simBefore.controls.total}`,
  )
  simBefore.rows.forEach((r) => console.log(r))
  if (simAfter) {
    console.log(
      `\n«ПОСЛЕ» — похожие ищутся по классу: ${simAfter.exact.ok}/${simAfter.exact.total} = ${pct(simAfter.exact)}` +
        `\n    точность найденного: ${simAfter.precision}%   полнота: ${simAfter.recall}%` +
        `\n    контроли «похожих нет»: ${simAfter.controls.ok}/${simAfter.controls.total}`,
    )
    simAfter.rows.forEach((r) => console.log(r))
  }

  /* --- C --- */
  const gapsBefore = measureGaps(warnedBefore)
  const gapsAfter = findBriefGaps
    ? measureGaps(
        (c) => findBriefGaps!(c.name, c.hint).length > 0,
        (c) => findBriefGaps!(c.name, c.hint).map((g) => g.kind),
      )
    : null

  console.log(`\n--- C. Что не определено: ${GAP_CASES.length} заявок, из них ${GAP_CASES.filter((c) => c.control).length} негативных контролей ---`)
  console.log(
    `\n«ДО» — платформа умела отклонить только пустую заявку: ${gapsBefore.all.ok}/${gapsBefore.all.total} = ${pct(gapsBefore.all)}` +
      `\n    негативные контроли пройдены молчанием: ${gapsBefore.controls.ok}/${gapsBefore.controls.total}`,
  )
  gapsBefore.rows.forEach((r) => console.log(r))
  if (gapsAfter) {
    console.log(
      `\n«ПОСЛЕ» — разбор заявки: ${gapsAfter.all.ok}/${gapsAfter.all.total} = ${pct(gapsAfter.all)}` +
        `\n    негативные контроли: ${gapsAfter.controls.ok}/${gapsAfter.controls.total}`,
    )
    gapsAfter.rows.forEach((r) => console.log(r))
  }

  /* --- итог --- */
  console.log("\n=== ИТОГО ===")
  console.log(`A. различимость продукта: ${pct(pairsBefore.all)} → ${pairsAfter ? pct(pairsAfter.all) : "(нет прибора)"}`)
  console.log(`B. похожие генерации:     ${pct(simBefore.exact)} → ${simAfter ? pct(simAfter.exact) : "(нет прибора)"}`)
  console.log(`C. предупреждения:        ${pct(gapsBefore.all)} → ${gapsAfter ? pct(gapsAfter.all) : "(нет прибора)"}`)
  console.log(
    "\nФакт кода, который не выражается долей: до волны ответ на все три вопроса человеку" +
      "\nне показывался вовсе — первый взгляд на заявку случался внутри генерации.\n",
  )

  /* Провал негативного контроля — поломка, а не цифра: перегиб (придирки к каждой заявке,
     ложные похожие) хуже прежней слепоты, потому что выглядит как знание. */
  if (gapsAfter && gapsAfter.controls.ok < gapsAfter.controls.total) process.exitCode = 1
  if (simAfter && simAfter.controls.ok < simAfter.controls.total) process.exitCode = 1
}

void main()
