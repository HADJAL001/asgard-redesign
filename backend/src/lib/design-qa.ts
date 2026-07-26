/* ================================================================
   OSGARD · Design QA — критик сгенерированного интерфейса
   ----------------------------------------------------------------
   Раньше единственной проверкой сгенерированного кода была
   `validateGeneratedFiles` (services/app-generator.ts) — то есть
   `ts.transpileModule`, только синтаксис одного файла. Ничто не
   проверяло, годен ли получившийся ИНТЕРФЕЙС: соблюдены ли токены
   дизайн-системы, доступен ли он с клавиатуры, работает ли на
   телефоне, осмысленны ли тексты.

   Здесь — чистый статический анализ TSX без сборки и без сети:
   быстрый, детерминированный, бесплатный. Он решает две задачи:
     1) даёт честный балл дизайна с РАЗБОРОМ (что именно стоило очков);
     2) формирует список конкретных нарушений, который уходит обратно
        в модель на этапе авторемонта — «почини вот это», а не
        «сделай лучше».

   Балл ПРОИЗВОДЕН от разбора (`computeDesignScore` = сумма факторов
   из `explainDesignQuality`) — ровно тот же приём, что в
   lib/proof-of-craft.ts (#62): число и его объяснение не могут
   разойтись, потому что источник один.
   ================================================================ */

export type DesignIssueSeverity = "error" | "warn"

export type DesignIssue = {
  /** Машинный идентификатор правила — по нему группируем и чиним. */
  rule: string
  severity: DesignIssueSeverity
  file: string
  /** Номер строки (1-based), если удалось определить. */
  line?: number
  /** Человекочитаемое объяснение — уходит и в UI, и в промпт ремонта. */
  message: string
}

export type DesignFactor = {
  key: string
  label: string
  detail: string
  points: number
  maxPoints: number
}

export type DesignReport = {
  /** Итоговый балл 0..100. Производный от factors. */
  score: number
  factors: DesignFactor[]
  issues: DesignIssue[]
  /** Сколько файлов реально проанализировано (конфиги не в счёт). */
  analyzedFiles: number
}

type AnalyzedFile = { path: string; content: string }

/* ----------------------------------------------------------------
   Вспомогательное
   ---------------------------------------------------------------- */

/** Файлы, которые пишет сама дизайн-система — их не судим её же правилами
 *  (в tailwind.config.ts сырые hex не нарушение, а единственный способ). */
const EXCLUDED_PATHS = new Set([
  "tailwind.config.ts",
  "postcss.config.js",
  "next.config.js",
  "tsconfig.json",
  "package.json",
  "app/globals.css",
  "app/layout.tsx",
  "readme.md",
])

function isAnalyzable(path: string): boolean {
  if (EXCLUDED_PATHS.has(path.toLowerCase())) return false
  return /\.tsx$/.test(path)
}

/** Номер строки по индексу в тексте (1-based). */
function lineAt(content: string, index: number): number {
  let line = 1
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10) line++
  }
  return line
}

/** Убирает комментарии и строковые литералы импортов, чтобы не ловить ложные
 *  срабатывания на пояснениях модели («// не используй bg-[#fff]»). */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
}

function collect(
  files: AnalyzedFile[],
  regex: RegExp,
  rule: string,
  severity: DesignIssueSeverity,
  message: (match: RegExpExecArray) => string,
  limitPerFile = 5,
): DesignIssue[] {
  const issues: DesignIssue[] = []
  for (const file of files) {
    const source = stripComments(file.content)
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`)
    let match: RegExpExecArray | null
    let found = 0
    while ((match = re.exec(source)) !== null && found < limitPerFile) {
      issues.push({ rule, severity, file: file.path, line: lineAt(source, match.index), message: message(match) })
      found++
      if (match.index === re.lastIndex) re.lastIndex++
    }
  }
  return issues
}

/* ----------------------------------------------------------------
   Правила
   ---------------------------------------------------------------- */

/** Палитра Tailwind по умолчанию — признак того, что модель проигнорировала токены. */
const DEFAULT_PALETTE =
  /\b(?:bg|text|border|ring|from|to|via|fill|stroke|decoration|outline|shadow|divide|placeholder|accent|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950)\b/

/** Сырой цвет: в произвольном значении Tailwind или в inline-стиле. */
const RAW_HEX_ARBITRARY = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|shadow|outline)-\[(?:#[0-9a-fA-F]{3,8}|rgba?\([^\])]*\)|hsla?\([^\])]*\))\]/
const RAW_HEX_INLINE = /(?:color|background(?:Color)?|borderColor|fill|stroke)\s*:\s*["'`]?\s*(?:#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/

function tokenDisciplineIssues(files: AnalyzedFile[]): DesignIssue[] {
  return [
    ...collect(files, DEFAULT_PALETTE, "palette/default-tailwind", "error", (m) =>
      `Использована палитра Tailwind по умолчанию «${m[0]}» вместо токена дизайн-системы (bg-canvas / bg-surface / text-ink / bg-primary …).`,
    ),
    ...collect(files, RAW_HEX_ARBITRARY, "palette/raw-color", "error", (m) =>
      `Сырой цвет «${m[0]}» вместо токена дизайн-системы. Из-за таких значений экраны расходятся по стилю.`,
    ),
    ...collect(files, RAW_HEX_INLINE, "palette/inline-style-color", "error", () =>
      `Цвет задан inline-стилем. Цвета берутся только из токенов (bg-primary, text-ink и т.д.).`,
    ),
  ]
}

function accessibilityIssues(files: AnalyzedFile[]): DesignIssue[] {
  const issues: DesignIssue[] = []

  // <img> без alt — самое частое и самое дешёвое в исправлении нарушение.
  issues.push(
    ...collect(files, /<img\b(?![^>]*\balt\s*=)[^>]*>/, "a11y/img-alt", "error", () =>
      `У <img> нет атрибута alt — изображение недоступно для скринридера.`,
    ),
  )

  // <button> без type внутри форм даёт неожиданный submit.
  issues.push(
    ...collect(files, /<button\b(?![^>]*\btype\s*=)[^>]*>/, "a11y/button-type", "warn", () =>
      `У <button> не указан type — внутри формы он по умолчанию отправляет её.`,
    ),
  )

  // Кликабельный div — недоступен ни с клавиатуры, ни для вспомогательных технологий.
  issues.push(
    ...collect(files, /<(?:div|span)\b[^>]*\bonClick\s*=/, "a11y/clickable-div", "error", (m) =>
      `Обработчик клика на <${m[0].slice(1).split(/[\s>]/)[0]}> — нужен <button> или <a>, иначе элемент недоступен с клавиатуры.`,
    ),
  )

  // <a> без href — не фокусируется и не является ссылкой по сути.
  issues.push(
    ...collect(files, /<a\b(?![^>]*\bhref\s*=)[^>]*>/, "a11y/anchor-href", "warn", () =>
      `У <a> нет href — такой элемент не попадает в порядок обхода с клавиатуры.`,
    ),
  )

  // Снятый фокус без замены — интерфейс становится непроходимым с клавиатуры.
  for (const file of files) {
    const source = stripComments(file.content)
    if (/\boutline-none\b|\bfocus:outline-none\b/.test(source) && !/focus-visible:/.test(source)) {
      const idx = source.search(/\boutline-none\b/)
      issues.push({
        rule: "a11y/focus-removed",
        severity: "error",
        file: file.path,
        line: lineAt(source, Math.max(idx, 0)),
        message: "Фокус снят (outline-none), но видимая замена focus-visible: не добавлена — навигация с клавиатуры становится невидимой.",
      })
    }
  }

  return issues
}

function responsivenessIssues(files: AnalyzedFile[]): DesignIssue[] {
  const issues: DesignIssue[] = []

  // Жёсткая ширина в пикселях ломает мобильный макет.
  issues.push(
    ...collect(files, /\b(?:w|min-w)-\[\d{3,}px\]/, "responsive/fixed-width", "warn", (m) =>
      `Жёсткая ширина «${m[0]}» ломает раскладку на телефоне — используй относительные ширины и max-w-*.`,
    ),
  )

  // Компонент со сколько-нибудь заметной разметкой без единого брейкпоинта.
  for (const file of files) {
    const source = stripComments(file.content)
    const classNameCount = (source.match(/className\s*=/g) || []).length
    const hasBreakpoint = /\b(?:sm|md|lg|xl):/.test(source)
    if (classNameCount >= 6 && !hasBreakpoint) {
      issues.push({
        rule: "responsive/no-breakpoints",
        severity: "warn",
        file: file.path,
        message: `В файле ${classNameCount} стилизованных элементов и ни одного адаптивного префикса (sm:/md:/lg:) — макет не подстраивается под экран.`,
      })
    }
  }

  return issues
}

function semanticsIssues(files: AnalyzedFile[]): DesignIssue[] {
  const issues: DesignIssue[] = []

  for (const file of files) {
    const source = stripComments(file.content)

    // Порядок заголовков: пропуск уровня ломает структуру документа.
    const levels = [...source.matchAll(/<h([1-6])\b/g)].map((m) => ({ level: Number(m[1]), index: m.index ?? 0 }))
    for (let i = 1; i < levels.length; i++) {
      if (levels[i].level - levels[i - 1].level > 1) {
        issues.push({
          rule: "semantics/heading-skip",
          severity: "warn",
          file: file.path,
          line: lineAt(source, levels[i].index),
          message: `Пропущен уровень заголовка: h${levels[i - 1].level} → h${levels[i].level}. Структура документа должна идти без разрывов.`,
        })
        break
      }
    }

    // На главной странице должен быть ровно один h1.
    if (file.path === "app/page.tsx") {
      const h1Count = (source.match(/<h1\b/g) || []).length
      if (h1Count === 0) {
        issues.push({
          rule: "semantics/missing-h1",
          severity: "warn",
          file: file.path,
          message: "На главной странице нет <h1> — ни поисковик, ни скринридер не понимают, о чём страница.",
        })
      } else if (h1Count > 1) {
        issues.push({
          rule: "semantics/multiple-h1",
          severity: "warn",
          file: file.path,
          message: `На странице ${h1Count} элементов <h1> — главный заголовок должен быть один.`,
        })
      }
    }
  }

  return issues
}

function contentIssues(files: AnalyzedFile[]): DesignIssue[] {
  const issues: DesignIssue[] = []

  issues.push(
    ...collect(files, /lorem\s+ipsum|dolor\s+sit\s+amet/i, "content/lorem", "error", () =>
      `Оставлен текст-рыба (lorem ipsum) — интерфейс должен содержать осмысленные тексты по теме приложения.`,
    ),
  )

  issues.push(
    ...collect(files, /\b(?:TODO|FIXME|ЗАГЛУШКА|placeholder text)\b/, "content/todo", "warn", (m) =>
      `В интерфейсе осталась пометка «${m[0]}» — незавершённый фрагмент виден пользователю.`,
    ),
  )

  // Список без пустого состояния: типовая дыра сгенерированных интерфейсов.
  for (const file of files) {
    const source = stripComments(file.content)
    const hasMap = /\.map\s*\(/.test(source)
    const hasEmptyState = /\.length\s*===?\s*0|\.length\s*<\s*1|!\w+\.length|\.length\s*\?/.test(source)
    if (hasMap && !hasEmptyState) {
      issues.push({
        rule: "content/no-empty-state",
        severity: "warn",
        file: file.path,
        message: "Список рендерится через .map(), но пустое состояние не предусмотрено — при отсутствии данных пользователь видит пустоту без объяснения.",
      })
    }
  }

  return issues
}

/* ----------------------------------------------------------------
   Балл и его разбор
   ---------------------------------------------------------------- */

/** Вес нарушения в очках штрафа. */
const SEVERITY_WEIGHT: Record<DesignIssueSeverity, number> = { error: 2, warn: 1 }

function factorFrom(
  key: string,
  label: string,
  issues: DesignIssue[],
  maxPoints: number,
  okDetail: string,
): DesignFactor {
  const penalty = issues.reduce((sum, i) => sum + SEVERITY_WEIGHT[i.severity], 0)
  // Штраф насыщается: пять грубых нарушений — уже дно фактора, дальше уточнять нечего.
  const points = Math.max(0, maxPoints - Math.min(maxPoints, penalty * (maxPoints / 10)))
  const detail = issues.length === 0 ? okDetail : `нарушений: ${issues.length} (${[...new Set(issues.map((i) => i.rule))].join(", ")})`
  return { key, label, detail, points: Math.round(points), maxPoints }
}

/**
 * Полный разбор качества интерфейса. Единственный источник правды:
 * `computeDesignScore` — производная от него, поэтому балл и объяснение
 * не могут разойтись (приём из lib/proof-of-craft.ts).
 */
export function explainDesignQuality(files: AnalyzedFile[]): DesignReport {
  const analyzable = files.filter((f) => isAnalyzable(f.path))

  // Нечего анализировать (например, генерация упала до создания страниц) —
  // честный ноль вместо ложной сотни.
  if (analyzable.length === 0) {
    return {
      score: 0,
      factors: [
        {
          key: "empty",
          label: "Нет файлов интерфейса",
          detail: "не найдено ни одного .tsx для анализа",
          points: 0,
          maxPoints: 100,
        },
      ],
      issues: [],
      analyzedFiles: 0,
    }
  }

  const token = tokenDisciplineIssues(analyzable)
  const a11y = accessibilityIssues(analyzable)
  const responsive = responsivenessIssues(analyzable)
  const semantics = semanticsIssues(analyzable)
  const content = contentIssues(analyzable)

  const factors: DesignFactor[] = [
    factorFrom("tokens", "Единство дизайн-системы", token, 35, "все цвета и шрифты взяты из токенов"),
    factorFrom("a11y", "Доступность", a11y, 25, "изображения, кнопки и фокус в порядке"),
    factorFrom("responsive", "Адаптивность", responsive, 15, "макет подстраивается под экран"),
    factorFrom("semantics", "Семантика разметки", semantics, 15, "структура заголовков корректна"),
    factorFrom("content", "Качество содержимого", content, 10, "тексты осмысленны, состояния предусмотрены"),
  ]

  const issues = [...token, ...a11y, ...responsive, ...semantics, ...content].sort((a, b) =>
    a.severity === b.severity ? a.file.localeCompare(b.file) : a.severity === "error" ? -1 : 1,
  )

  const score = factors.reduce((sum, f) => sum + f.points, 0)

  return { score, factors, issues, analyzedFiles: analyzable.length }
}

/** Балл дизайна 0..100. Производный от explainDesignQuality — расхождение невозможно. */
export function computeDesignScore(files: AnalyzedFile[]): number {
  return explainDesignQuality(files).score
}

/**
 * Компактная сводка нарушений для промпта авторемонта: сгруппировано по файлу,
 * только то, что действительно стоит чинить, с ограничением по объёму — иначе
 * список нарушений вытеснит из контекста сам код.
 */
export function formatIssuesForRepair(issues: DesignIssue[], maxIssues = 12): string {
  const top = issues.slice(0, maxIssues)
  if (top.length === 0) return ""

  const byFile = new Map<string, DesignIssue[]>()
  for (const issue of top) {
    const list = byFile.get(issue.file) ?? []
    list.push(issue)
    byFile.set(issue.file, list)
  }

  return [...byFile.entries()]
    .map(([file, list]) => `${file}:\n${list.map((i) => `  - [${i.rule}]${i.line ? ` строка ${i.line}:` : ""} ${i.message}`).join("\n")}`)
    .join("\n")
}

/** Файлы, к которым есть претензии — их и имеет смысл перегенерировать. */
export function filesNeedingRepair(issues: DesignIssue[]): string[] {
  const errorFiles = new Set(issues.filter((i) => i.severity === "error").map((i) => i.file))
  if (errorFiles.size > 0) return [...errorFiles]
  return [...new Set(issues.map((i) => i.file))]
}
