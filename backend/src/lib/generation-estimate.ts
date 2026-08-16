import db from "./db"
import { GENERATION_DEPTHS, type GenerationDepth } from "./generation-depths"

/* ================================================================
   OSGARD · Смета генерации ДО запуска
   ----------------------------------------------------------------
   Зачем: миграция 095 научила платформу честно говорить, во что генерация
   обошлась. Но говорила она это ПОСЛЕ — когда квота уже потрачена, а
   кредиты списаны. Человек нажимал кнопку, не зная цены: жалоба №1 ко всем
   AI-сборщикам приложений и единственная часть расхода, которую никто на
   рынке не показывает заранее.

   Здесь платформа отвечает на вопрос «сколько это будет стоить» ДО списания
   — и отвечает не выдуманным числом, а собственной историей: реальный
   расход прошлых генераций того же профиля из колонок 095.

   Четыре решения, которые делают смету честной, а не украшением:

   0. ГЛАВНОЕ ЧИСЛО — КОРИДОР, А НЕ МЕДИАНА. Это не выбор из вкуса, а вывод
      живой проверки, стоившей девяти настоящих генераций: путь смета
      предсказала верно 9 из 9, но в ±10% по токенам попала 1 запись из 6.
      Отклонения доходили до +86% и −49%. Дефект оказался в постановке, а не
      в реализации: настоящий разброс расхода между идеями двукратный
      (48–88 обращений, 226–548 тыс. токенов), потому что цену определяет
      сложность самой идеи — а профиль «глубина + путь» на идею не смотрит.
      Никакое количество замеров этого не исправит.

      Отсюда правило: наружу и на экран идёт интервал, медиана подписана как
      ориентир. Точное число появится только вместе с прогнозом по признакам
      замысла (длина описания, число сущностей) — это уже модель, а не
      наблюдение, и это отдельная волна.

   1. МЕДИАНА, А НЕ СРЕДНЕЕ. Внутри коридора ориентиром стоит медиана: одна
      аварийная генерация с десятком раундов ремонта тянет среднее вверх так,
      что смета перестаёт описывать типичный случай.

      Коридор именно p10–p90, и это исправление, купленное живой проверкой,
      а не выбор из вкуса. Сначала здесь стоял межквартильный размах
      p25–p75 — и на первых же настоящих генерациях факт вышел за его
      границы. Дефект был не в статистике, а в обещании: p25–p75 по
      построению накрывает половину запусков, то есть слова «обычно от… до…»
      врали бы каждому второму человеку. Коридор, который показывают перед
      списанием, обязан накрывать почти все случаи, а не ровно половину.

   2. ПРОФИЛЬ, А НЕ ОБЩИЙ КОТЁЛ. Шаблонный путь и полная AI-генерация
      различаются на порядок, и различие известно ЗАРАНЕЕ: подберётся ли
      шаблон, решает детерминированный `findBestTemplate` (services/
      template-store) до всякого обращения к модели. Поэтому смета считается
      по выборке с той же глубиной И тем же путём; при нехватке данных
      базис честно расширяется, и это видно в ответе (`basis`).

   3. ЧЕСТНОЕ «НЕ ЗНАЮ». Меньше MIN_SAMPLES замеров — числа не выдаются
      вовсе (`basis: "none"`). Выдумать смету на одном наблюдении значило бы
      соврать ровно в том месте, ради которого модуль и написан.

   Оговорка к точности, которую нельзя прятать: часть провайдеров не отдаёт
   usage, их токены оценены по длине текста (`estimated` в телеметрии).
   Доля таких вызовов в выборке отдаётся наружу (`unmeasuredShare`) —
   пользователь должен знать, где цифра точна, а где приблизительна.
   ================================================================ */

/** Какой путь генерации получит эта идея. Различие в расходе — на порядок. */
export type GenerationPath = "template" | "ai"

/** Одна замеренная генерация из истории (колонки 095). */
export type GenerationSample = {
  depth: GenerationDepth
  path: GenerationPath
  /** Обращений к моделям. 0 — валидное значение: шаблонный путь может обойтись без ИИ. */
  calls: number
  tokens: number
  durationMs: number
  /** Собралось ли с первого раза. null — старая генерация, признак не измерялся. */
  firstTry: boolean | null
  /** Сколько вызовов этой генерации провайдер не отдал в usage. */
  unmeasured: number
}

/**
 * Коридор расхода и ориентир внутри него. Порядок полей отражает порядок важности:
 * наружу выдаётся ИНТЕРВАЛ, а `median` — вспомогательный ориентир, не цена.
 *
 * Почему так, а не «медиана плюс погрешность»: живая проверка на настоящих
 * генерациях показала, что медиана профиля попадает в ±10% факта примерно в одном
 * случае из шести. Причина не в статистике — расход определяет сложность самой идеи,
 * а профиль «глубина + путь» на идею не смотрит вовсе. Поэтому одно число здесь
 * принципиально не может быть обещанием, и подавать его как обещание нельзя.
 */
export type Spread = { median: number; low: number; high: number }

/**
 * На чём основана смета — это часть ответа, а не служебная деталь: пользователь
 * должен отличать «мы видели 40 таких генераций» от «мы вообще не видели похожих».
 *   profile  — та же глубина и тот же путь (лучший случай);
 *   depth    — та же глубина, путь другой;
 *   platform — любые замеренные генерации платформы;
 *   none     — данных недостаточно, числа не выдаются.
 */
export type EstimateBasis = "profile" | "depth" | "platform" | "none"

export type GenerationEstimate = {
  depth: GenerationDepth
  path: GenerationPath
  /** Твёрдая часть цены: списание кредитов известно точно, не оценивается. */
  credits: number
  /** Тратит ли запуск дневную квоту тарифа. */
  countsAgainstQuota: boolean
  basis: EstimateBasis
  /** Сколько прошлых генераций легло в основу. */
  samples: number
  aiCalls: Spread | null
  tokens: Spread | null
  durationMs: Spread | null
  /** Доля генераций этого профиля, собравшихся без единого ремонта. null — не измерялось. */
  firstTryRate: number | null
  /** Доля вызовов в выборке, чьи токены оценены, а не получены от провайдера. */
  unmeasuredShare: number
}

/** Меньше трёх замеров — не выборка, а совпадение. Смету на них не строим. */
export const MIN_ESTIMATE_SAMPLES = 3

/** Сколько последних генераций берём в расчёт: генератор меняется волнами, и расход
 *  полугодовой давности описывает уже не тот код. Свежесть важнее полноты. */
export const ESTIMATE_HISTORY_LIMIT = 200

/** Значение на позиции p (0..1) по методу nearest-rank — без интерполяции: смета
 *  должна быть воспроизводимым наблюдением, а не сглаженной моделью. */
function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const rank = Math.ceil(p * sortedAsc.length)
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank - 1))
  return sortedAsc[idx]
}

/** Границы коридора. Именно p10–p90, а не межквартильный размах: коридор, который
 *  показывают ПЕРЕД списанием, обязан накрывать почти все запуски. p25–p75 по
 *  построению накрывает ровно половину — с такой подписью «обычно от… до…» смета
 *  обманывала бы каждого второго, и на живых генерациях так и вышло. */
export const SPREAD_LOW_PERCENTILE = 0.1
export const SPREAD_HIGH_PERCENTILE = 0.9

/**
 * Доля наблюдений, которую коридор обязан накрывать. Записана числом НАМЕРЕННО, а не
 * выведена из процентилей выше: производная величина уехала бы вместе с ними, и тест
 * покрытия остался бы зелёным при любой правке границ — то есть стерёг бы пустоту.
 * Это отдельное обещание человеку, и оно должно ломаться, когда границы сужают.
 */
export const SPREAD_MIN_COVERAGE = 0.8

/** Коридор расхода p10–p90 и ориентир (медиана) внутри него. */
export function spreadOf(values: number[]): Spread | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return {
    median: percentile(sorted, 0.5),
    low: percentile(sorted, SPREAD_LOW_PERCENTILE),
    high: percentile(sorted, SPREAD_HIGH_PERCENTILE),
  }
}

/**
 * Читает историю замеренного расхода. `gen_ai_calls IS NOT NULL` — граница между
 * измеренными генерациями и теми, что прошли до миграции 095: у последних расход
 * никто не фиксировал, и подставлять им нули значило бы разбавить смету
 * несуществующей дешевизной.
 *
 * `ai_source = 'fallback'` исключается намеренно: это генерация БЕЗ ИИ (модель не
 * ответила, отдан минимальный каркас). Её расход не описывает ни один из путей,
 * которые получит пользователь при работающем ИИ.
 */
export function loadGenerationSamples(limit = ESTIMATE_HISTORY_LIMIT): GenerationSample[] {
  try {
    const rows = db
      .prepare(
        `SELECT generation_depth as depth, ai_source as aiSource, gen_ai_calls as calls,
                gen_tokens_in as tokensIn, gen_tokens_out as tokensOut,
                gen_duration_ms as durationMs, gen_first_try as firstTry, gen_meter as meter
           FROM projects
          WHERE gen_ai_calls IS NOT NULL
            AND gen_duration_ms IS NOT NULL
            AND ai_source IS NOT 'fallback'
          ORDER BY id DESC
          LIMIT ?`,
      )
      .all(limit) as Array<{
      depth: string | null
      aiSource: string | null
      calls: number
      tokensIn: number | null
      tokensOut: number | null
      durationMs: number
      firstTry: number | null
      meter: string | null
    }>

    return rows.map((r) => ({
      depth: (r.depth === "standard" || r.depth === "deep" ? r.depth : "quick") as GenerationDepth,
      /* Путь виден по источнику: 'template-ai'/'template-local' — адаптация шаблона,
         'ai' — полная генерация. Иных значений source не бывает (app-generator/
         template-adapter), но неизвестное трактуем как 'ai': это дороже, и ошибка
         в консервативную сторону предпочтительнее заниженной сметы. */
      path: (r.aiSource || "").startsWith("template") ? "template" : "ai",
      calls: r.calls ?? 0,
      tokens: (r.tokensIn ?? 0) + (r.tokensOut ?? 0),
      durationMs: r.durationMs,
      firstTry: r.firstTry === null ? null : r.firstTry === 1,
      unmeasured: readUnmeasured(r.meter),
    }))
  } catch {
    /* Схема без колонок 095 — истории нет, смета честно скажет «не знаю». */
    return []
  }
}

/** Сколько вызовов генерации остались без usage провайдера (подробности в gen_meter). */
function readUnmeasured(meter: string | null): number {
  if (!meter) return 0
  try {
    const parsed = JSON.parse(meter)
    const value = parsed?.unmeasured
    return typeof value === "number" && value >= 0 ? value : 0
  } catch {
    return 0
  }
}

/** Числовая часть сметы по готовой выборке. Чистая функция — вся статистика проверяема
 *  без БД, без сети и без переменных окружения. */
function summarize(samples: GenerationSample[]) {
  const measured = samples.filter((s) => s.firstTry !== null)
  const totalCalls = samples.reduce((sum, s) => sum + s.calls, 0)
  const totalUnmeasured = samples.reduce((sum, s) => sum + s.unmeasured, 0)

  return {
    aiCalls: spreadOf(samples.map((s) => s.calls)),
    tokens: spreadOf(samples.map((s) => s.tokens)),
    durationMs: spreadOf(samples.map((s) => s.durationMs)),
    /* Доля «с первого раза» считается только по тем генерациям, где признак измерялся:
       выдавать неизмеренное за неудачу — та же ложь, что выдавать за удачу. */
    firstTryRate:
      measured.length > 0 ? measured.filter((s) => s.firstTry === true).length / measured.length : null,
    unmeasuredShare: totalCalls > 0 ? Math.min(1, totalUnmeasured / totalCalls) : 0,
  }
}

/**
 * Смета для одной глубины и одного пути по переданной истории.
 *
 * История приходит АРГУМЕНТОМ, а не читается внутри: так вся логика выбора базиса
 * тестируется на любых наборах данных без БД. (Урок волны 5: полагаться на
 * `NODE_ENV === "test"` внутри модуля нельзя — под `tsx --test` он остаётся undefined.)
 */
export function estimateGenerationCost(params: {
  depth: GenerationDepth
  path: GenerationPath
  samples: GenerationSample[]
}): GenerationEstimate {
  const { depth, path } = params
  const cfg = GENERATION_DEPTHS[depth]

  /* Базис сужаем от точного к общему и останавливаемся на первом, где данных хватает.
     Порядок именно такой: лучше 3 точных наблюдения, чем 200 разнородных. */
  const candidates: Array<{ basis: EstimateBasis; rows: GenerationSample[] }> = [
    { basis: "profile", rows: params.samples.filter((s) => s.depth === depth && s.path === path) },
    { basis: "depth", rows: params.samples.filter((s) => s.depth === depth) },
    { basis: "platform", rows: params.samples },
  ]

  const chosen = candidates.find((c) => c.rows.length >= MIN_ESTIMATE_SAMPLES)

  const base = {
    depth,
    path,
    credits: cfg?.credits ?? 0,
    countsAgainstQuota: cfg?.countsAgainstQuota ?? false,
  }

  if (!chosen) {
    /* Данных мало. Кредиты и квота всё равно известны точно — их и отдаём, а
       предсказание расхода не выдумываем. */
    return {
      ...base,
      basis: "none",
      samples: candidates[0].rows.length,
      aiCalls: null,
      tokens: null,
      durationMs: null,
      firstTryRate: null,
      unmeasuredShare: 0,
    }
  }

  return { ...base, basis: chosen.basis, samples: chosen.rows.length, ...summarize(chosen.rows) }
}

/**
 * Смета по всем глубинам сразу — то, что показывается человеку перед кнопкой запуска:
 * не «сколько стоит выбранное», а «сколько стоит каждый вариант», чтобы выбор был
 * осознанным до списания, а не после.
 *
 * `pathByDepth` приходит извне (маршрут вычисляет его через findBestTemplate): этот
 * модуль не должен зависеть от корпуса шаблонов, иначе его нельзя тестировать
 * отдельно.
 */
export function estimateAllDepths(params: {
  samples: GenerationSample[]
  pathByDepth: Record<GenerationDepth, GenerationPath>
}): Record<GenerationDepth, GenerationEstimate> {
  const out = {} as Record<GenerationDepth, GenerationEstimate>
  for (const depth of Object.keys(GENERATION_DEPTHS) as GenerationDepth[]) {
    out[depth] = estimateGenerationCost({
      depth,
      path: params.pathByDepth[depth] ?? "ai",
      samples: params.samples,
    })
  }
  return out
}
