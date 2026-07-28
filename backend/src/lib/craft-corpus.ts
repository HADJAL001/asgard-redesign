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
}

/**
 * Есть ли у правила человеческая формулировка. Правило без неё копится в базе,
 * но в промпт не попадает — то есть платформа «учится» впустую. Проверяется
 * тестом: любое новое правило обязано прийти вместе с формулировкой.
 */
export function hasLessonText(rule: string): boolean {
  return Object.prototype.hasOwnProperty.call(LESSON_TEXT, rule)
}

/**
 * Блок «выученные уроки» для промпта генерации. Строится из РЕАЛЬНОЙ статистики
 * дефектов этой платформы, а не из общих советов: чем чаще генератор ошибался на
 * правиле, тем выше оно в списке. Пустая статистика → пустая строка (промпт не
 * меняется, деградации нет).
 */
export function renderLessonsContract(limit = 6): string {
  const lessons = topLessons(limit).filter((l) => LESSON_TEXT[l.rule])
  if (lessons.length === 0) return ""

  return `=== ВЫУЧЕННЫЕ УРОКИ (статистика реальных поломок этой платформы) ===
Эти ошибки уже ломали сборку сгенерированных приложений. Не повторяй их:
${lessons.map((l, i) => `${i + 1}. ${LESSON_TEXT[l.rule]}`).join("\n")}
=== КОНЕЦ УРОКОВ ===`
}

/** Сводка обучения для витрины/админки: сколько уроков и как часто они повторялись. */
export function getLessonsReport(): { rules: number; occurrences: number; top: Lesson[] } {
  try {
    const totals = db
      .prepare(`SELECT COUNT(*) as rules, COALESCE(SUM(occurrences), 0) as occurrences FROM generation_lessons`)
      .get() as { rules: number; occurrences: number }
    return { ...totals, top: topLessons(5) }
  } catch {
    return { rules: 0, occurrences: 0, top: [] }
  }
}
