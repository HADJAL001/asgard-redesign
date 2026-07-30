import db from "./db"
import { classifyProduct, PRODUCT_CLASS_LABEL, type Capability, type ProductClass } from "./product-class"

/* ================================================================
   OSGARD · Взгляд до генерации (волна 7, п.4)
   ----------------------------------------------------------------
   ЧТО БЫЛО. До кодогенерации платформа не смотрела на заявку вообще.
   Роут проверял «имя ИЛИ идея непусты», `detectTheme` выбирал одну из
   восьми тем по словарю, `findBestTemplate` брал хэш темы и балл
   качества. Первый осмысленный взгляд на заявку случался ВНУТРИ
   генерации, когда деньги и время уже потрачены. Человек нажимал
   кнопку, не зная ни что платформа поняла, ни на что это похоже, ни
   что в его заявке не определено.

   ЧТО ЗДЕСЬ. Три ответа, которые платформа обязана дать ДО кнопки:

     (а) ЧТО ЗА ПРОДУКТ просят — класс, а не тема (lib/product-class).
     (б) НА ЧТО ЭТО ПОХОЖЕ из прошлых генераций и ЧЕМ ТЕ КОНЧИЛИСЬ —
         по классу, с вердиктом сборки, деплоем и числом «переделай».
     (в) ЧТО В ЗАЯВКЕ НЕ ОПРЕДЕЛЕНО и чем это грозит — с фактом из
         корпуса там, где факт есть, и с прямым «фактов пока нет» там,
         где его нет.

   ЗАПРЕТ ДОСКИ СОБЛЮДЁН БУКВАЛЬНО: ни одного обращения к модели.
   Класс — чистая функция, похожесть и исходы — SQL по `projects`,
   риски — та же чистая функция, применённая к прошлым заявкам.
   Стоимость и время генерации не меняются вовсе: этот код работает
   ДО генерации, по запросу человека, и в саму генерацию не входит.

   ПОЧЕМУ РИСК СЧИТАЕТСЯ ПЕРЕСЧЁТОМ, А НЕ ХРАНИТСЯ. Пробел прошлой
   заявки (не сказано, что хранить; деньги без входа) выводится из её
   же названия и описания тем же кодом, что и для новой. Хранить
   пробелы отдельным полем значило бы завести вторую правду, которая
   молча разойдётся с первой при любой правке словаря.

   ГРАНИЦА ПРИВАТНОСТИ. Чужие заявки читаются только чтобы посчитать
   исходы, и наружу не уходят ни одной строкой: наружу идут агрегаты
   по классу и ИМЕНОВАННЫЕ примеры только собственных проектов
   человека. Показать чужое название рядом с «это похоже на ваш
   замысел» — утечка замысла, а не польза.

   ЧЕСТНОЕ «ФАКТОВ НЕТ». Один похожий проект — не статистика. Ниже
   порога `MIN_FACTS` исходы отдаются, но вывод из них не делается:
   `null` вместо доли. Витрина обязана сказать «фактов пока нет», а не
   показать «100% переделывают» по одному случаю.

   Все обращения к БД ленивые и проглатывают ошибку: взгляд до
   генерации не имеет права мешать генерации (урок инцидента #59).
   ================================================================ */

/** Меньше трёх похожих генераций — не статистика, а совпадение. */
export const MIN_FACTS = 3

/** Сколько прошлых заявок класса разбирается на пробелы. Свежие важнее старых:
 *  словарь возможностей и сам генератор меняются, и вывод из позапрошлого корпуса
 *  говорит о прошлой платформе, а не об этой. */
const HISTORY_WINDOW = 200

/** Сколько собственных примеров показывать человеку. Больше — это уже список проектов,
 *  а он у человека и так есть. */
const OWN_EXAMPLES = 3

/** Исход прошлой генерации — ровно то, что доска называет «чем те кончились». */
export type PastOutcome = {
  /** Вердикт инженерного контура: passed | repaired | broken | unverified | null (не мерили). */
  verdict: string | null
  /** Человек выложил результат наружу. Сильнее «годится» платформа не увидит. */
  deployed: boolean
  /** Сколько раз человек просил переделать. */
  refinements: number
}

export type SimilarSummary = {
  cls: ProductClass
  classLabel: string
  /** Сколько прошлых генераций этого класса вообще есть. */
  total: number
  /** Сколько собралось с первого раза / после ремонта / осталось битыми. */
  passed: number
  repaired: number
  broken: number
  /** Сколько не проверялось контуром (генерации до волны инженерного контура). */
  unverified: number
  deployed: number
  refined: number
  /** Доли — `null` ниже порога `MIN_FACTS`: вывод из двух случаев был бы выдумкой. */
  deployedShare: number | null
  brokenShare: number | null
  refinedShare: number | null
  /** Собственные проекты человека того же класса — единственное, что можно назвать. */
  ownExamples: Array<{ id: number; name: string; outcome: PastOutcome }>
}

export type GapKind =
  | "unknown-class"
  | "decorative-only"
  | "too-short"
  | "data-undefined"
  | "payments-without-auth"
  | "personal-without-auth"
  | "payments-without-price"
  | "realtime-vs-offline"

export type BriefGap = {
  kind: GapKind
  /** Что именно не определено — словами человека, а не терминами кода. */
  what: string
  /** Чем это грозит. Следствие, а не выговор. */
  risk: string
  /**
   * Факт из корпуса: как кончились прошлые генерации С ТЕМ ЖЕ пробелом.
   * `null` — фактов недостаточно, и это говорится прямо.
   */
  fact: { sameGap: number; refined: number; broken: number; deployed: number } | null
}

export type Preflight = {
  /** (а) Что за продукт. */
  cls: ProductClass
  classLabel: string
  capabilities: Capability[]
  /** Слова заявки, из которых выведен класс: ответ проверяем человеком. */
  evidence: string[]
  /** (б) На что похоже и чем кончилось. */
  similar: SimilarSummary
  /** (в) Что не определено и чем грозит. */
  gaps: BriefGap[]
  /**
   * Есть ли у платформы вообще данные для ответа (б).
   * `false` — корпус этого класса пуст: честная пустота, а не ноль процентов.
   */
  measured: boolean
}

/* ---------------- пробелы заявки ---------------- */

const PRICE_WORDS = ["цена", "цены", "price", "стоимост", "руб", "₽", "usd", "eur", "$", "тенге", "бесплатн", "тариф"]
const PERSONAL_WORDS = ["личный кабинет", "мой профил", "свои ", "мои ", "профил", "profile", "account", "аккаунт"]

/** Классы, у которых обязательно есть что показывать списком: без предмета генератор его выдумает. */
const DATA_CLASSES: ProductClass[] = [
  "catalog-commerce",
  "content-feed",
  "social-community",
  "dashboard-analytics",
  "tracker-crud",
  "booking-schedule",
]

/** Возможности, любая из которых отвечает на вопрос «что хранить и показывать». */
const DATA_CAPABILITIES: Capability[] = ["catalog", "feed", "crud-records", "schedule", "charts"]

/**
 * Пробелы заявки — чистая функция от текста. Тем же кодом разбираются и новая заявка, и
 * прошлые: иначе факт «столько же заявок имели этот пробел» считался бы по другому правилу,
 * чем то, которое человек видит сейчас.
 *
 * Порядок в списке — порядок серьёзности: сверху то, из-за чего генерация уйдёт не туда
 * целиком, ниже то, что стоит одной доработки.
 */
export function findBriefGaps(name: string, hint?: string | null): BriefGap[] {
  const match = classifyProduct(name, hint)
  const haystack = `${name || ""} ${hint || ""}`.toLowerCase()
  const owned = new Set(match.capabilities)
  const gaps: Array<Omit<BriefGap, "fact">> = []

  if (match.decorativeOnly) {
    gaps.push({
      kind: "decorative-only",
      what: "заявка описывает вид и настроение, но не работу: ни одной возможности не названо",
      risk: "платформа сгенерирует красивую витрину, а не то, чем пользуются — и переделывать придётся целиком",
    })
  } else if (match.cls === "unknown") {
    gaps.push({
      kind: "unknown-class",
      what: "по заявке не понять, что должно работать",
      risk: "класс продукта не определён, поэтому платформа не может ни подобрать похожее, ни предупредить о типичных поломках",
    })
  }

  if (match.words < 8) {
    gaps.push({
      kind: "too-short",
      what: "заявка короче восьми осмысленных слов",
      risk: "почти всё придётся домыслить за вас: чем короче заявка, тем больше решений принимает генератор молча",
    })
  }

  if (DATA_CLASSES.includes(match.cls) && !DATA_CAPABILITIES.some((c) => owned.has(c))) {
    gaps.push({
      kind: "data-undefined",
      what: "не сказано, что платформа должна хранить и показывать списком",
      risk: "сущности будут выдуманы генератором — обычно это и есть причина первой просьбы «переделай»",
    })
  }

  if (owned.has("payments") && !owned.has("auth")) {
    gaps.push({
      kind: "payments-without-auth",
      what: "есть оплата, но нет входа",
      risk: "платить сможет кто угодно, а свои покупки не увидит никто: оплату придётся переделывать вместе со входом",
    })
  }

  if (!owned.has("auth") && !owned.has("payments") && PERSONAL_WORDS.some((w) => haystack.includes(w))) {
    gaps.push({
      kind: "personal-without-auth",
      what: "речь о личном («профиль», «мои»), но вход не назван",
      risk: "личные данные окажутся общими для всех посетителей",
    })
  }

  if (owned.has("payments") && !PRICE_WORDS.some((w) => haystack.includes(w))) {
    gaps.push({
      kind: "payments-without-price",
      what: "оплата есть, а цена и валюта не названы",
      risk: "суммы будут проставлены наугад, и их придётся править вручную по всему коду",
    })
  }

  if (owned.has("chat-realtime") && owned.has("offline")) {
    gaps.push({
      kind: "realtime-vs-offline",
      what: "живой обмен сообщениями и работа без сети требуют разного устройства",
      risk: "генератор выберет одно из двух сам, и половина заявки останется невыполненной",
    })
  }

  return gaps.map((g) => ({ ...g, fact: null }))
}

/* ---------------- прошлые генерации того же класса ---------------- */

type HistoryRow = {
  id: number
  user_id: number
  name: string
  description: string | null
  build_status: string | null
  deploy_status: string | null
  refinements: number
}

/** Прошлые генерации класса вместе с исходами. Пустой массив — и на пустой базе, и на
 *  схеме без миграций: «похожего нет» и «мерить нечем» витрина различает полем `measured`. */
function readHistory(cls: ProductClass): HistoryRow[] {
  if (cls === "unknown") return [] // по «не знаю» похожесть искать нельзя: нашлось бы что угодно

  try {
    return db
      .prepare(
        `SELECT p.id, p.user_id, p.name, p.description, p.build_status, p.deploy_status,
                COALESCE((SELECT COUNT(*) FROM project_refinements r WHERE r.project_id = p.id), 0) AS refinements
         FROM projects p
         WHERE p.product_class = ?
         ORDER BY p.created_at DESC
         LIMIT ?`,
      )
      .all(cls, HISTORY_WINDOW) as HistoryRow[]
  } catch {
    /* Схема без 101 (или без 089/029) — взгляд назад невозможен, но взгляд на заявку
       остаётся: класс и пробелы считаются без базы. */
    return []
  }
}

function outcomeOf(row: HistoryRow): PastOutcome {
  return {
    verdict: row.build_status ?? null,
    deployed: row.deploy_status === "deployed",
    refinements: row.refinements,
  }
}

function share(part: number, total: number): number | null {
  if (total < MIN_FACTS) return null // вывод из двух случаев был бы выдумкой
  return Math.round((part / total) * 100) / 100
}

/* ---------------- сборка ответа ---------------- */

/**
 * Взгляд платформы на заявку до генерации.
 *
 * `userId` нужен ровно для одного: отделить собственные проекты человека (их можно
 * называть) от чужих (их можно только считать).
 */
export function preflight(params: { userId: number; name?: string | null; hint?: string | null }): Preflight {
  const name = (params.name ?? "").trim()
  const hint = (params.hint ?? "").trim() || null

  const match = classifyProduct(name, hint)
  const history = readHistory(match.cls)

  const summary: SimilarSummary = {
    cls: match.cls,
    classLabel: PRODUCT_CLASS_LABEL[match.cls],
    total: history.length,
    passed: 0,
    repaired: 0,
    broken: 0,
    unverified: 0,
    deployed: 0,
    refined: 0,
    deployedShare: null,
    brokenShare: null,
    refinedShare: null,
    ownExamples: [],
  }

  for (const row of history) {
    const outcome = outcomeOf(row)
    if (outcome.verdict === "passed") summary.passed += 1
    else if (outcome.verdict === "repaired") summary.repaired += 1
    else if (outcome.verdict === "broken") summary.broken += 1
    else summary.unverified += 1

    if (outcome.deployed) summary.deployed += 1
    if (outcome.refinements > 0) summary.refined += 1

    if (row.user_id === params.userId && summary.ownExamples.length < OWN_EXAMPLES) {
      summary.ownExamples.push({ id: row.id, name: row.name, outcome })
    }
  }

  summary.deployedShare = share(summary.deployed, summary.total)
  summary.brokenShare = share(summary.broken, summary.total)
  summary.refinedShare = share(summary.refined, summary.total)

  /* Пробелы новой заявки — и факт по каждому: как кончились прошлые генерации, у которых
     был РОВНО ТОТ ЖЕ пробел. Пробелы прошлых заявок пересчитываются здесь же тем же кодом. */
  const gaps = findBriefGaps(name, hint)
  if (gaps.length > 0 && history.length > 0) {
    const pastGaps = history.map((row) => ({
      row,
      kinds: new Set(findBriefGaps(row.name, row.description).map((g) => g.kind)),
    }))

    for (const gap of gaps) {
      const same = pastGaps.filter((p) => p.kinds.has(gap.kind))
      if (same.length < MIN_FACTS) continue // ниже порога факт не объявляем — см. шапку

      gap.fact = {
        sameGap: same.length,
        refined: same.filter((p) => p.row.refinements > 0).length,
        broken: same.filter((p) => p.row.build_status === "broken").length,
        deployed: same.filter((p) => p.row.deploy_status === "deployed").length,
      }
    }
  }

  return {
    cls: match.cls,
    classLabel: PRODUCT_CLASS_LABEL[match.cls],
    capabilities: match.capabilities,
    evidence: match.evidence,
    similar: summary,
    gaps,
    measured: history.length > 0,
  }
}

/* ---------------- наблюдаемость ---------------- */

export type ForesightReport = {
  /** Всего проектов в базе. */
  projects: number
  /** У скольких класс выведен (миграция 101 доехала и пересчитала). */
  classified: number
  /** У скольких класс выведен, но функция в заявке не названа — `unknown`. */
  unknownClass: number
  /** Разрез по классам: видно, на какие классы у платформы есть факты, а на какие нет. */
  byClass: Array<{ cls: string; total: number; deployed: number; refined: number; broken: number }>
  /** Доля проектов с выведенным классом, 0..1. `null` — база пуста. */
  classifiedShare: number | null
  /** По скольким классам фактов хватает на вывод (>= MIN_FACTS). */
  classesWithFacts: number
}

/**
 * Витрина взгляда наперёд.
 *
 * Без этих чисел «платформа видит наперёд» — утверждение про код: в проде класс может
 * быть выведен у нуля проектов (миграция не доехала) или у всех, но `unknown` — и
 * механизм честно ответит «фактов нет» на каждую заявку. Это обязано быть видно числом.
 */
export function foresightReport(): ForesightReport {
  const empty: ForesightReport = {
    projects: 0,
    classified: 0,
    unknownClass: 0,
    byClass: [],
    classifiedShare: null,
    classesWithFacts: 0,
  }

  try {
    const totals = db
      .prepare(
        `SELECT COUNT(*) AS projects,
                COALESCE(SUM(CASE WHEN product_class IS NOT NULL THEN 1 ELSE 0 END), 0) AS classified,
                COALESCE(SUM(CASE WHEN product_class = 'unknown' THEN 1 ELSE 0 END), 0) AS unknownClass
         FROM projects`,
      )
      .get() as { projects: number; classified: number; unknownClass: number }

    if (totals.projects === 0) return empty

    const byClass = db
      .prepare(
        `SELECT p.product_class AS cls, COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN p.deploy_status = 'deployed' THEN 1 ELSE 0 END), 0) AS deployed,
                COALESCE(SUM(CASE WHEN p.build_status = 'broken' THEN 1 ELSE 0 END), 0) AS broken,
                COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM project_refinements r WHERE r.project_id = p.id)
                                  THEN 1 ELSE 0 END), 0) AS refined
         FROM projects p
         WHERE p.product_class IS NOT NULL
         GROUP BY p.product_class
         ORDER BY total DESC, cls ASC`,
      )
      .all() as Array<{ cls: string; total: number; deployed: number; broken: number; refined: number }>

    return {
      projects: totals.projects,
      classified: totals.classified,
      unknownClass: totals.unknownClass,
      byClass,
      classifiedShare: Math.round((totals.classified / totals.projects) * 1000) / 1000,
      /* Класс `unknown` в счёт не идёт: по нему похожесть не ищется вовсе. */
      classesWithFacts: byClass.filter((c) => c.cls !== "unknown" && c.total >= MIN_FACTS).length,
    }
  } catch {
    return empty // схема без 101 — витрина честно пустая, а не сломанная
  }
}
