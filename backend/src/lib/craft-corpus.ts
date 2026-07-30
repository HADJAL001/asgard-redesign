import db from "./db"
import { captureError } from "./sentry"
import type { EngineeringVerdict } from "./project-engineering"

/* ================================================================
   OSGARD · Корпус ремесла — платформа, которая учится на себе
   ----------------------------------------------------------------
   Две памяти, обе питаются результатами инженерного контура:

   1. ПАМЯТЬ УДАЧ (качество шаблона). Раньше корпус шаблонов копил
      что попало: код сохранялся до проверки, первый шаблон темы
      фиксировался навсегда, выбор шёл по популярности. Теперь у
      каждого шаблона есть измеримое качество, производное от
      вердикта сборки и балла интерфейса, и лучший ВЫТЕСНЯЕТ худшего
      (см. template-store.saveTemplateFromGeneration). Это отбор:
      корпус монотонно улучшается, а не просто растёт.

   2. ПАМЯТЬ ОШИБОК (уроки). Каждый дефект, найденный контуром, —
      это факт о том, где генератор систематически ошибается. Частоты
      правил копятся в `generation_lessons`, а топ подмешивается в
      промпт КАЖДОЙ следующей генерации отдельным блоком «выученные
      уроки». Платформа перестаёт повторять свои же ошибки — код
      становится крепче с каждым циклом, без ручной подкрутки промптов.

   Оба механизма честны и объяснимы: балл производен от измерений,
   урок — от реально случившегося дефекта. Ничего не выдумывается.

   Все обращения к БД — ленивые, внутри функций (урок инцидента #59:
   модульный db.prepare на колонку новой миграции роняет boot).
   Любая ошибка проглатывается: обучение не имеет права ронять
   генерацию.
   ================================================================ */

export type CraftQualityInput = {
  verdict: EngineeringVerdict
  /** Балл интерфейса 0..100 (lib/design-qa). */
  designScore: number
  /** Сколько ремонтов потребовалось коду, чтобы стать рабочим. */
  repairs: number
}

/**
 * Качество кода для корпуса, 0..100. Производно от измерений, а не от мнения:
 * основа — балл интерфейса, множитель — инженерный вердикт, штраф — цена ремонта.
 *
 * `broken`/`unverified` дают 0: непроверенному коду в памяти платформы не место,
 * иначе следующие проекты унаследуют его дефекты (ровно это и происходило).
 */
export function craftQuality(input: CraftQualityInput): number {
  if (input.verdict === "broken" || input.verdict === "unverified") return 0

  const base = Math.max(0, Math.min(100, input.designScore))
  // Код, которому потребовался ремонт, честно слабее того, что родился рабочим.
  const verdictFactor = input.verdict === "passed" ? 1 : 0.9
  const repairPenalty = Math.min(15, Math.max(0, input.repairs) * 3)

  return Math.max(0, Math.min(100, Math.round(base * verdictFactor - repairPenalty)))
}

/** Годится ли результат для памяти платформы вообще. */
export function isWorthLearning(verdict: EngineeringVerdict): boolean {
  return verdict === "passed" || verdict === "repaired"
}

/* ----------------------------------------------------------------
   Память ошибок
   ---------------------------------------------------------------- */

export type Lesson = { rule: string; count: number }

/** Копит частоты правил, на которых ломается генерация. Никогда не бросает. */
export function recordLessons(lessons: Lesson[]): void {
  if (lessons.length === 0) return
  try {
    const upsert = db.prepare(
      `INSERT INTO generation_lessons (rule, occurrences, last_seen)
       VALUES (?, ?, ?)
       ON CONFLICT(rule) DO UPDATE SET
         occurrences = occurrences + excluded.occurrences,
         last_seen = excluded.last_seen`,
    )
    const now = Date.now()
    for (const lesson of lessons) {
      if (!lesson.rule || lesson.count <= 0) continue
      upsert.run(lesson.rule, lesson.count, now)
    }
  } catch (err) {
    captureError("[craft-corpus] не удалось записать уроки (схема без 092?):", err)
  }
}

/** Топ правил, на которых платформа ошибается чаще всего. */
export function topLessons(limit = 6): Lesson[] {
  try {
    const rows = db
      .prepare(`SELECT rule, occurrences as count FROM generation_lessons ORDER BY occurrences DESC, rule ASC LIMIT ?`)
      .all(limit) as Lesson[]
    return rows
  } catch {
    return [] // схема без 092 — просто нет уроков, генерация идёт как раньше
  }
}

/** Человеческая формулировка урока для промпта. Правило → конкретный запрет. */
const LESSON_TEXT: Record<string, string> = {
  "use-client-missing":
    'если в файле есть хук (useState/useEffect/…) или обработчик события — ПЕРВОЙ строкой файла обязана быть директива "use client"',
  "import-missing": "импортируй только файлы из списка выше — путей, которых нет в списке, не существует",
  "dependency-missing": "сторонние npm-пакеты запрещены: доступны только next, react и react-dom",
  "default-export-missing": "каждый компонент отдавай через export default — иначе импорт получит undefined",
  "route-default-export-missing": "страница и layout обязаны отдавать компонент через export default",
  "named-import-missing": "именованный импорт бери только у того, что реально экспортировано именованно",
  "api-route-unsupported": "не создавай серверные роуты app/api — приложение собирается статически",
  "server-action-unsupported": 'не используй "use server" и Server Actions',
  "server-only-api": "не используй next/headers (cookies/headers) — при статическом экспорте их нет",
  "dynamic-route-unexportable": "динамический маршрут [param] обязан экспортировать generateStaticParams",
  "dynamic-flag-unsupported": "не экспортируй const dynamic/revalidate — они несовместимы со статическим экспортом",
  "browser-global-toplevel":
    "window/document/localStorage используй только внутри useEffect или обработчика, никогда на верхнем уровне модуля",
  "markdown-leak": "возвращай только код без markdown-обвязки и пояснений",
  "placeholder-code": "никаких заглушек «// ... остальной код» — файл должен быть полным",
  "empty-file": "файл не может быть пустым",
  syntax: "следи за парностью скобок и закрытием JSX-тегов",
  "client-metadata-conflict": "не смешивай export metadata с хуками в одном файле — вынеси интерактив в отдельный компонент",
  "root-page-missing": "в приложении обязана быть главная страница app/page.tsx",
  "no-source-files": "в приложении обязан быть хотя бы один файл кода",

  /* Правила досборки контракта экспортов (lib/generation-contract). Их чинит
     детерминированный проход ДО инженерного контура, поэтому в счётчик они
     раньше не попадали вообще — и модель повторяла их из генерации в генерацию.
     Все три найдены НАСТОЯЩЕЙ сборкой (next build) на живом прогоне. */
  "duplicate-declaration":
    "объявляй каждое имя в файле ОДИН раз: для двойного экспорта пиши `export { X }` рядом с `export default X`, а не второе `export function X` (webpack падает на «X redefined»)",
  "self-assignment":
    "не пиши `const X = X` — это ссылка на саму себя, а не реэкспорт; чтобы отдать импортированное имя дальше, используй `export { X }`",
  "import-name-collision":
    "не называй свою функцию/компонент именем, которое уже импортировано в этом файле (`import { Search }` + `function Search()` — для сборки это переопределение)",

  /* Правила контракта ТИПОВ ПРОПОВ (lib/props-contract, волна 3). Файлы пишутся
     параллельно, поэтому потребитель не видит сигнатуру соседа — и передаёт не то,
     что тот принимает. Обычный tsc это ловит, но каркас глушит его через
     ignoreBuildErrors, а prerender всё равно падает. */
  "prop-type-mismatch":
    "смотри, ЧТО именно принимает проп: если тип `LucideIcon`/`ComponentType` — передавай сам компонент (`icon={FileText}`), а не отрисованный элемент (`icon={<FileText />}`); если тип `ReactNode` — наоборот, передавай разметку",
  "prop-required-missing":
    "передавай все обязательные пропы компонента (те, что объявлены без `?`) — иначе сборка падает на проверке типов; не уверен, что проп нужен всегда — объявляй его как необязательный",
  "prop-unknown":
    "не передавай пропы, которых нет в сигнатуре компонента: имя должно совпадать с объявленным буква в букву",
}

/**
 * Есть ли у правила человеческая формулировка. Правило без неё копится в базе,
 * но в промпт не попадает — то есть платформа «учится» впустую. Проверяется
 * тестом: любое новое правило обязано прийти вместе с формулировкой.
 */
export function hasLessonText(rule: string): boolean {
  return Object.prototype.hasOwnProperty.call(LESSON_TEXT, rule)
}

/** Рукописная формулировка правила, если она есть. Всегда старше любой машинной. */
export function handwrittenLessonText(rule: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(LESSON_TEXT, rule) ? LESSON_TEXT[rule] : undefined
}

/**
 * Образцы стиля для автора уроков (lib/lesson-author): по ним модель понимает, какой
 * длины и тона ждут от формулировки. Берём рукописные — это эталон, выверенный руками.
 * Порядок стабилен, поэтому промпт разбора детерминирован при том же входе.
 */
export function lessonStyleExamples(limit = 3): string[] {
  return Object.values(LESSON_TEXT).slice(0, Math.max(0, limit))
}

/* ----------------------------------------------------------------
   Формулировки, которые платформа написала себе сама (миграция 093)
   ----------------------------------------------------------------
   Рукописный словарь выше — предел обучения: правило без строки в КОДЕ промпт
   отбрасывал, сколько бы раз дефект ни ломал сборку. Волна 5 дала платформе право
   формулировать урок самой, разобрав реальный дефект сильной моделью.

   Читается здесь, а пишется в lib/lesson-author — намеренно: craft-corpus владеет
   памятью платформы, автор только пополняет её. Обратный импорт дал бы цикл модулей.
   ---------------------------------------------------------------- */

/**
 * Принятые машинные формулировки: правило → текст. Читается на КАЖДОЙ сборке промпта,
 * поэтому запрос минимальный и никогда не бросает: отказ БД обязан значить «своих
 * уроков нет» (поведение волны 4), а не «генерация упала».
 */
export function authoredLessonTexts(): Map<string, string> {
  try {
    const rows = db
      .prepare(`SELECT rule, text FROM generation_lesson_texts WHERE text IS NOT NULL`)
      .all() as Array<{ rule: string; text: string }>
    return new Map(rows.map((r) => [r.rule, r.text]))
  } catch {
    return new Map() // схема без 093 — как до волны 5
  }
}

export type AuthoredLessonRow = {
  rule: string
  text: string | null
  source: string
  model: string | null
  attempts: number
  lastError: string | null
  occurrencesAtAuthoring: number
  sampleMessage: string | null
  sampleFile: string | null
  diagnosis: string | null
  createdAt: number
  updatedAt: number
  /** Сколько раз формулировку переписывали после того, как она себя не оправдала (097). */
  revisions: number
  /** Формулировки, уже доказавшие бесполезность: принимать их снова нельзя (097). */
  retiredTexts: string[]
  lastRevisedAt: number | null
}

/** Все записи авторства — и принятые уроки, и забракованные попытки (нужно витрине). */
export function listAuthoredLessons(): AuthoredLessonRow[] {
  try {
    const rows = db
      .prepare(`SELECT * FROM generation_lesson_texts ORDER BY (text IS NULL), updated_at DESC`)
      .all() as any[]
    return rows.map((row) => ({
      rule: row.rule,
      text: row.text ?? null,
      source: row.source,
      model: row.model ?? null,
      attempts: row.attempts ?? 0,
      lastError: row.last_error ?? null,
      occurrencesAtAuthoring: row.occurrences_at_authoring ?? 0,
      sampleMessage: row.sample_message ?? null,
      sampleFile: row.sample_file ?? null,
      diagnosis: row.diagnosis ?? null,
      createdAt: row.created_at ?? 0,
      updatedAt: row.updated_at ?? 0,
      /* Колонки волны 6. Схема без 097 даёт undefined — читаем как «не переписывали»,
         чтобы витрина и отбор работали против старой базы без правки кода. */
      revisions: row.revisions ?? 0,
      retiredTexts: parseRetiredTexts(row.retired_texts),
      lastRevisedAt: row.last_revised_at ?? null,
    }))
  } catch {
    return []
  }
}

/**
 * Разбор списка отбракованных формулировок. Битый JSON обязан значить «список пуст», а
 * не падение: колонка нужна только чтобы НЕ принять повторно плохой текст, и ронять
 * из-за неё чтение всей памяти платформы нельзя.
 */
function parseRetiredTexts(raw: unknown): string[] {
  if (typeof raw !== "string" || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : []
  } catch {
    return []
  }
}

/**
 * Итоговый текст урока: рукописный, иначе свой машинный.
 *
 * Приоритет рукописного безусловен и не настраивается: выверенная руками формулировка
 * надёжнее любой сгенерированной, а расхождение двух источников на одном правиле
 * должно решаться предсказуемо, а не по дате записи.
 */
export function resolveLessonText(rule: string, authored?: Map<string, string>): string | undefined {
  return handwrittenLessonText(rule) ?? (authored ?? authoredLessonTexts()).get(rule)
}

/* ----------------------------------------------------------------
   Польза урока и отбор в промпт (волна 6, миграция 097)
   ----------------------------------------------------------------
   Волна 5 научилась МЕРИТЬ пользу урока, но отбор в промпт остался по одной
   частоте — и вышло два вывернутых наизнанку следствия:

     1. Плохой урок ПОДНИМАЕТСЯ: формулировка не работает → дефект повторяется →
        `occurrences` растёт → правило лезет в топ. Чем хуже урок, тем крепче он
        держит место.
     2. Хороший урок ВЫТЕСНЯЕТСЯ: урок сработал → дефект перестал случаться →
        частота не растёт → правило уезжает вниз и выпадает из промпта, после чего
        дефект возвращается. Успех выглядит как ненужность.

   Мест в промпте ровно `limit`, поэтому каждый бесполезный урок стоит одного
   полезного. Ниже — отбор, который смотрит на РЕЗУЛЬТАТ, а не только на частоту.
   ---------------------------------------------------------------- */

/**
 * Сколько повторов после обучения считаем приговором формулировке.
 *
 * Один повтор ничего не доказывает: генерация могла уже идти, когда урок только
 * записался, — осуждать по нему значит переписывать рабочие уроки за деньги.
 */
const LESSON_FAIL_THRESHOLD = 2

/**
 * Какая доля мест в промпте закреплена за уроками с доказанной пользой.
 *
 * Половина, и это компромисс по существу: не закрепить ничего — сработавший урок
 * вытеснится и дефект вернётся; закрепить всё — новое знание никогда не попадёт в
 * промпт, платформа замрёт на том, что уже выучила.
 */
const PROVEN_SLOT_SHARE = 0.5

export type LessonEffect =
  /** После урока дефект не повторялся ни разу — формулировка работает. */
  | "works"
  /** Повторы есть, но их мало для приговора. */
  | "unclear"
  /** Дефект повторяется после урока — формулировка не работает. */
  | "fails"
  /** Точки отсчёта нет (рукописные уроки): судить не по чему. */
  | "unmeasured"

/**
 * Классификация пользы урока по числу повторов после обучения.
 *
 * `null` на входе — это «не измеряем», и оно НЕ равно нулю повторов: у рукописных
 * уроков момента обучения не существует, они появились вместе с кодом. Смешать эти
 * два случая значило бы объявить рукописные уроки доказанно работающими и закрепить
 * за ними места в промпте без единого измерения.
 */
export function classifyLessonEffect(repeatedAfterLearning: number | null): LessonEffect {
  if (repeatedAfterLearning === null) return "unmeasured"
  if (repeatedAfterLearning <= 0) return "works"
  if (repeatedAfterLearning >= LESSON_FAIL_THRESHOLD) return "fails"
  return "unclear"
}

/** Урок с формулировкой и измеренной пользой — то, чем оперируют и промпт, и витрина. */
export type RankedLesson = Lesson & {
  text: string
  origin: "hand" | "self"
  repeatedAfterLearning: number | null
  effect: LessonEffect
  /** Сколько раз формулировку уже переписывали (волна 6). */
  revisions: number
}

/**
 * Все правила с формулировкой (и отдельно — копящиеся впустую), с измеренной пользой.
 *
 * Единственный источник и для промпта, и для витрины. Разделять их нельзя: витрина
 * обязана показывать ровно то, что видит модель, иначе она снова начнёт врать —
 * ровно этот дефект честности ловили в волне 4.
 */
function buildLessonView(): { withText: RankedLesson[]; silent: Lesson[]; authoredRows: AuthoredLessonRow[] } {
  const all = topLessons(500)
  const authoredRows = listAuthoredLessons()
  const authoredText = new Map(authoredRows.filter((r) => r.text).map((r) => [r.rule, r.text as string]))
  const learnedAt = new Map(authoredRows.filter((r) => r.text).map((r) => [r.rule, r.occurrencesAtAuthoring]))
  const revisionsOf = new Map(authoredRows.map((r) => [r.rule, r.revisions]))

  const withText: RankedLesson[] = []
  const silent: Lesson[] = []

  for (const lesson of all) {
    const hand = handwrittenLessonText(lesson.rule)
    const text = hand ?? authoredText.get(lesson.rule)
    if (!text) {
      silent.push(lesson)
      continue
    }
    const base = hand ? null : learnedAt.get(lesson.rule)
    const repeated = base === null || base === undefined ? null : Math.max(0, lesson.count - base)
    withText.push({
      ...lesson,
      text,
      origin: hand ? "hand" : "self",
      repeatedAfterLearning: repeated,
      effect: classifyLessonEffect(repeated),
      revisions: revisionsOf.get(lesson.rule) ?? 0,
    })
  }

  return { withText, silent, authoredRows }
}

/**
 * Какие уроки реально уйдут в промпт следующей генерации.
 *
 * Порядок отбора:
 *   1. Половина мест закреплена за уроками с ДОКАЗАННОЙ пользой — иначе сработавший
 *      урок вытесняется собственным успехом и дефект возвращается.
 *   2. Остальные места — по частоте, но урок с провалившейся формулировкой уходит в
 *      самый конец: он занимал бы место, ничего не покупая.
 *   3. Если мест больше, чем кандидатов, добираем чем есть — включая провалившиеся:
 *      плохая формулировка всё же лучше пустого места.
 *
 * Детерминировано при том же входе (сортировки со вторичным ключом по имени правила),
 * поэтому промпт воспроизводим, а тест не зависит от порядка строк из БД.
 */
export function selectPromptLessons(limit = 6): RankedLesson[] {
  if (limit <= 0) return []
  const { withText } = buildLessonView()
  if (withText.length === 0) return []

  const byCount = (a: RankedLesson, b: RankedLesson) => b.count - a.count || a.rule.localeCompare(b.rule)

  const chosen: RankedLesson[] = []
  const taken = new Set<string>()

  const provenSlots = Math.floor(limit * PROVEN_SLOT_SHARE)
  for (const lesson of withText.filter((l) => l.effect === "works").sort(byCount)) {
    if (chosen.length >= provenSlots) break
    chosen.push(lesson)
    taken.add(lesson.rule)
  }

  /* Провалившиеся — в конец очереди, а не вон: правило настоящее, дефект настоящий,
     и до переписывания формулировки лучше сказать модели хоть что-то. */
  const rest = withText
    .filter((l) => !taken.has(l.rule))
    .sort((a, b) => {
      const aFails = a.effect === "fails" ? 1 : 0
      const bFails = b.effect === "fails" ? 1 : 0
      return aFails - bFails || byCount(a, b)
    })

  for (const lesson of rest) {
    if (chosen.length >= limit) break
    chosen.push(lesson)
    taken.add(lesson.rule)
  }

  return chosen
}

/**
 * Все уроки с формулировкой и измеренной пользой — целиком, без отбора в промпт.
 *
 * Нужен автору уроков (волна 6): переписывать надо и те провалившиеся формулировки,
 * которые в промпт уже не попали. Иначе урок, вытесненный за бесполезность, остался бы
 * бесполезным навсегда — выпал из промпта и тем самым выпал из внимания.
 */
export function rankedLessons(): RankedLesson[] {
  return buildLessonView().withText
}

/**
 * Блок «выученные уроки» для промпта генерации. Строится из РЕАЛЬНОЙ статистики
 * дефектов этой платформы, а не из общих советов. Пустая статистика → пустая строка
 * (промпт не меняется, деградации нет).
 *
 * С волны 6 порядок определяется не только частотой, но и доказанной пользой урока —
 * см. `selectPromptLessons`.
 */
export function renderLessonsContract(limit = 6): string {
  const lessons = selectPromptLessons(limit)
  if (lessons.length === 0) return ""

  return `=== ВЫУЧЕННЫЕ УРОКИ (статистика реальных поломок этой платформы) ===
Эти ошибки уже ломали сборку сгенерированных приложений. Не повторяй их:
${lessons.map((entry, i) => `${i + 1}. ${entry.text}`).join("\n")}
=== КОНЕЦ УРОКОВ ===`
}

/**
 * Урок с формулировкой — ровно в том виде, в каком он доходит до модели.
 *
 * Поля:
 *   origin — кто автор формулировки: рука разработчика или сама платформа (волна 5);
 *   repeatedAfterLearning — сколько раз дефект повторился ПОСЛЕ того, как урок начал
 *     доходить до модели. Есть только у своих уроков: для рукописных момент обучения
 *     не зафиксирован, точки отсчёта нет. `null` значит «не измеряем», а не «нуль
 *     повторов» — выдавать одно за другое было бы ложью в отчёте;
 *   effect — тот же факт, приведённый к вердикту (волна 6);
 *   revisions — сколько раз формулировку переписывали, когда она не работала.
 */
export type TaughtLesson = RankedLesson

export type LessonsReport = {
  rules: number
  occurrences: number
  top: Lesson[]
  /** Правила, которые РЕАЛЬНО уходят в промпт следующей генерации (топ + формулировка). */
  taught: TaughtLesson[]
  /** Правила, которые копятся в базе, но в промпт не попадают — учёба впустую. */
  silent: Lesson[]
  /** Сколько правил промпт берёт за раз (тот же лимит, что у renderLessonsContract). */
  promptLimit: number
  /** Сколько формулировок платформа написала себе сама — рост знания без правки кода. */
  selfAuthored: number
  /**
   * Попытки разбора, закончившиеся отказом (модель недоступна, ответ не прошёл
   * валидацию). Показывается наружу намеренно: провал обучения обязан быть виден,
   * иначе «платформа ничему не научилась» становится необъяснимым фактом.
   */
  authoringFailures: Array<{ rule: string; reason: string; attempts: number }>
  /**
   * Уроки с формулировкой, которые в промпт НЕ попали, и причина. Волна 4 показывала
   * только «правило без формулировки»; теперь видно и вторую потерю: формулировка есть,
   * но урок либо доказанно не работает, либо не поднялся по частоте. Без причины
   * задержка урока здесь неотличима от поломки отбора.
   */
  demoted: Array<{ rule: string; count: number; reason: "не работает" | "вне топа"; revisions: number }>
  /** Сколько уроков с доказанной пользой (после них дефект не повторялся). */
  working: number
  /** Сколько уроков доказанно не работают — кандидаты на переписывание. */
  failing: number
}

/**
 * Сводка обучения для витрины: сколько уроков, как часто повторялись, и — главное —
 * ЧТО из этого доходит до модели.
 *
 * Разделение `taught`/`silent` не косметика. Правило без формулировки копится в
 * `generation_lessons`, но `renderLessonsContract` его отбрасывает: платформа честно
 * считает свои поломки и при этом ничему не учится. Ровно это и происходило до волны 2
 * с правилами досборки контракта. Пока цифру некому показать, регресс возвращается
 * молча — поэтому «сколько правил учится впустую» обязано быть видно наружу.
 *
 * Ещё одна асимметрия, которую делает видимой `promptLimit`: в промпт уходит только
 * ТОП правил, поэтому редкое правило может иметь формулировку и всё равно не доходить
 * до модели — оно попадёт в `taught` лишь когда поднимется в топ.
 *
 * С волны 5 сводка отвечает и на главный вопрос — РАБОТАЕТ ли обучение:
 * `repeatedAfterLearning` считает повторы дефекта после того, как урок дошёл до модели.
 * Ноль повторов — урок сработал; растущее число — формулировку надо менять. Без этой
 * цифры «платформа умнеет» остаётся верой, а не измерением.
 */
export function getLessonsReport(limit = 6): LessonsReport {
  const empty: LessonsReport = {
    rules: 0,
    occurrences: 0,
    top: [],
    taught: [],
    silent: [],
    promptLimit: limit,
    selfAuthored: 0,
    authoringFailures: [],
    demoted: [],
    working: 0,
    failing: 0,
  }
  try {
    const totals = db
      .prepare(`SELECT COUNT(*) as rules, COALESCE(SUM(occurrences), 0) as occurrences FROM generation_lessons`)
      .get() as { rules: number; occurrences: number }

    /* Один источник с промптом: `taught` — это буквально то, что уйдёт в следующую
       генерацию, а не похожий список, посчитанный рядом. Считать дважды означало бы
       рано или поздно разойтись и показывать основателю не то, что видит модель. */
    const { withText, silent, authoredRows } = buildLessonView()
    const taught = selectPromptLessons(limit)
    const inPrompt = new Set(taught.map((l) => l.rule))

    return {
      ...totals,
      top: [...withText, ...silent].sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)).slice(0, 5),
      taught,
      silent,
      promptLimit: limit,
      selfAuthored: authoredRows.filter((r) => r.text).length,
      authoringFailures: authoredRows
        .filter((r) => !r.text && r.lastError)
        .map((r) => ({ rule: r.rule, reason: r.lastError as string, attempts: r.attempts })),
      demoted: withText
        .filter((l) => !inPrompt.has(l.rule))
        .map((l) => ({
          rule: l.rule,
          count: l.count,
          /* Различать причины обязательно: «не работает» — вина формулировки и повод её
             переписать, «вне топа» — просто редкий дефект. Слить их в одно значило бы
             послать на переписывание исправные уроки. */
          reason: l.effect === "fails" ? ("не работает" as const) : ("вне топа" as const),
          revisions: l.revisions,
        })),
      working: withText.filter((l) => l.effect === "works").length,
      failing: withText.filter((l) => l.effect === "fails").length,
    }
  } catch {
    return empty // схема без 092 — витрина честно пустая, а не выдуманная
  }
}
