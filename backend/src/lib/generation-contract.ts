import { componentNameFor, type SourceFile } from "./build-integrity"

/* ================================================================
   OSGARD · Контракт экспортов генерации
   ----------------------------------------------------------------
   ЗАЧЕМ. Файлы приложения генерируются ПАРАЛЛЕЛЬНО (app-generator.ts,
   Promise.all по манифесту) и не видят друг друга. В промпт каждого
   файла подставлялся список соседей вида

       - components/Hero.tsx: Шапка страницы

   то есть путь и назначение, но НЕ экспорты. Промпт требовал «точно
   соответствуй путям» — а промахивались не пути, а ФОРМА импорта:

       import Hero from "./Hero"        ← а файл отдаёт export function Hero
       import { Card } from "./Card"    ← а файл отдаёт export default Card

   На живом тесте это дало 18 ошибок импортов в одном приложении.

   РЕШЕНИЕ — контракт, выведенный КОДОМ, а не моделью. Имя экспорта у
   файла приложения не является свободным выбором: оно однозначно
   следует из пути (`components/Hero.tsx` → `Hero`). Значит контракт
   вычисляется детерминированно из уже полученного манифеста, БЕЗ
   единого дополнительного AI-вызова: «фаза 1» — это фаза кода.
   Стоимость и время генерации не растут.

   ДВОЙНОЙ ЭКСПОРТ. Компоненты обязаны отдавать и `default`, и
   одноимённый именованный экспорт. Это снимает целый класс промахов
   ценой одной строки в файле: какую бы из двух форм импорта ни выбрал
   сосед, она окажется верной. Для страниц/layout App Router default
   обязателен по контракту фреймворка, для хуков и утилит осмысленного
   default нет — там только именованный.

   Модуль ничего не знает про AI и про БД: на вход манифест и файлы,
   на выходе контракт и список расхождений. Проверяется юнит-тестами
   без ключей.
   ================================================================ */

export type ExportShape = {
  /** Путь файла в наборе (нормализованный, без ведущего слэша). */
  path: string
  /** Имя символа, под которым файл известен соседям. */
  symbol: string
  /** Обязан ли файл отдавать `export default`. */
  requiresDefault: boolean
  /** Обязан ли файл отдавать именованный `export <symbol>`. */
  requiresNamed: boolean
  /** Спецификатор, которым соседи обязаны его импортировать. */
  importSpec: string
  /** Готовая строка импорта — ровно то, что модель должна написать. */
  importLine: string
}

export type ExportContract = {
  files: ExportShape[]
  byPath: Map<string, ExportShape>
}

/* ----------------------------------------------------------------
   Вывод контракта из манифеста
   ---------------------------------------------------------------- */

function normalize(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "")
}

/** Компилятор нужен только для поиска границ повторных объявлений (см. ниже).
 *  Недоступен — правило деградирует молча, остальная сверка работает без него. */
let tsCache: typeof import("typescript") | null | undefined
function loadTs(): typeof import("typescript") | null {
  if (tsCache !== undefined) return tsCache
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    tsCache = require("typescript") as typeof import("typescript")
  } catch {
    tsCache = null
  }
  return tsCache
}

/** Файлы каркаса (staticTemplateFiles) и конфиги: контракт экспортов к ним НЕ
 *  применяется. `tailwind.config.ts` отдаёт default-конфиг и импортирует сам
 *  tailwindcss — по правилам приложения это выглядело бы нарушением, хотя это
 *  штатный конфиг сборки, который платформа кладёт сама. */
const CONFIG_RE = /^(?:[^/]+\.config\.(?:ts|js|mjs|cjs)|next-env\.d\.ts|middleware\.ts)$/

export function isFrameworkConfig(path: string): boolean {
  return CONFIG_RE.test(normalize(path))
}

/** Файлы-маршруты App Router: контракт фреймворка требует именно default. */
function isRouteFile(path: string): boolean {
  return /^app\/.*\b(page|layout|template|loading|error|not-found)\.tsx?$/.test(path)
}

function isHook(path: string): boolean {
  return path.startsWith("hooks/")
}

/** Компонент: и default, и именованный — любая форма импорта соседа верна. */
function isComponent(path: string): boolean {
  return path.startsWith("components/") && /\.tsx$/.test(path)
}

/** Имя символа по пути. Для хуков приводим к форме useXxx — иначе React-правила
 *  назовут это обычной функцией, и вызов хука окажется вне контракта. */
function symbolFor(path: string): string {
  const base = componentNameFor(path)
  if (!isHook(path)) return base
  return /^[Uu]se[A-Z]/.test(base) ? `use${base.slice(3)}` : `use${base}`
}

function importSpecFor(path: string): string {
  return `@/${path.replace(/\.tsx?$/, "")}`
}

function shapeFor(rawPath: string): ExportShape {
  const path = normalize(rawPath)
  const symbol = symbolFor(path)
  const requiresDefault = isRouteFile(path) || isComponent(path)
  const requiresNamed = !isRouteFile(path)
  const importSpec = importSpecFor(path)

  const importLine = requiresDefault
    ? `import ${symbol} from "${importSpec}"`
    : `import { ${symbol} } from "${importSpec}"`

  return { path, symbol, requiresDefault, requiresNamed, importSpec, importLine }
}

/**
 * Строит контракт по манифесту. Детерминированно, без AI-вызовов.
 * Файлы маршрутов (`app/**`) в контракт импорта не попадают: их никто не
 * импортирует, их монтирует роутер — но требование default для них остаётся.
 */
export function deriveExportContract(paths: string[]): ExportContract {
  const files: ExportShape[] = []
  const byPath = new Map<string, ExportShape>()

  for (const raw of paths) {
    if (isFrameworkConfig(raw)) continue // конфиги сборки живут по своим правилам
    const shape = shapeFor(raw)
    if (byPath.has(shape.path)) continue
    files.push(shape)
    byPath.set(shape.path, shape)
  }

  return { files, byPath }
}

/* ----------------------------------------------------------------
   Рендер контракта в промпт
   ---------------------------------------------------------------- */

/**
 * Блок для промпта генерации файла: точные строки импорта соседей.
 * Заменяет прежний список «путь: назначение», из-за которого модель
 * угадывала форму импорта.
 */
export function renderExportContract(
  contract: ExportContract,
  purposeByPath: Map<string, string>,
  selfPath?: string,
): string {
  const self = selfPath ? normalize(selfPath) : null
  const importable = contract.files.filter((f) => f.path !== self && !isRouteFile(f.path))

  const lines = importable.map((f) => {
    const purpose = purposeByPath.get(f.path)
    const exports = f.requiresDefault && f.requiresNamed
      ? `default ${f.symbol} + именованный ${f.symbol}`
      : f.requiresDefault
        ? `default ${f.symbol}`
        : `именованный ${f.symbol}`
    return `- ${f.path}${purpose ? ` — ${purpose}` : ""}\n  экспортирует: ${exports}\n  импортируй ТАК: ${f.importLine}`
  })

  const own = self ? contract.byPath.get(self) : undefined
  const ownRule = own
    ? `\nТВОЙ ФАЙЛ "${own.path}" ОБЯЗАН экспортировать: ${
        own.requiresDefault && own.requiresNamed
          ? `и \`export default ${own.symbol}\`, и \`export function ${own.symbol}\` (обе формы одновременно — соседи могут импортировать любой из них)`
          : own.requiresDefault
            ? `\`export default ${own.symbol}\``
            : `\`export function ${own.symbol}\` (именованный)`
      }.`
    : ""

  return `КОНТРАКТ ЭКСПОРТОВ (обязателен, проверяется автоматически до выдачи).
Файлы приложения пишутся параллельно, поэтому форма импорта зафиксирована заранее.
${lines.length > 0 ? `\nДоступные для импорта файлы:\n${lines.join("\n")}` : "\nДругих файлов для импорта нет."}
${ownRule}

Запрещено импортировать файлы, которых нет в списке выше: они не будут созданы,
и сборка упадёт с "Module not found". Нужна вспомогательная функция — объяви её
в этом же файле, а не импортируй из несуществующего модуля.

Из внешних пакетов доступны ТОЛЬКО: next, react, react-dom и lucide-react
(иконки, например \`import { Plus } from "lucide-react"\`). Любой другой пакет
не установлен, и сборка упадёт.`
}

/* ----------------------------------------------------------------
   Сверка результата с контрактом
   ---------------------------------------------------------------- */

export type ContractViolation = {
  kind: "missing-export" | "unknown-import" | "wrong-import-form"
  file: string
  message: string
  /** Путь недостающего файла — если нарушение чинится досборкой. */
  missingPath?: string
  symbol?: string
}

const IMPORT_RE = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gm
/** Пакеты каркаса — ровно те, что staticTemplateFiles объявляет в package.json
 *  (app-generator.ts). Список обязан совпадать с ним и с BUILTIN_PACKAGES в
 *  build-integrity.ts, иначе сверка и детектор скажут разное об одном импорте. */
const BUILTIN_PACKAGES = new Set(["next", "react", "react-dom", "lucide-react"])

function isLocalSpec(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("/")
}

/** Разрешает локальный спецификатор в путь набора (те же суффиксы, что у сборщика). */
export function resolveContractPath(spec: string, fromPath: string, known: Set<string>): string | null {
  let base: string
  if (spec.startsWith("@/")) base = normalize(spec.slice(2))
  else if (spec.startsWith("/")) base = normalize(spec.slice(1))
  else {
    const dir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : ""
    base = normalize(`${dir}/${spec}`)
      .split("/")
      .reduce<string[]>((acc, part) => {
        if (part === "..") acc.pop()
        else if (part !== ".") acc.push(part)
        return acc
      }, [])
      .join("/")
  }

  for (const suffix of ["", ".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (known.has(`${base}${suffix}`)) return `${base}${suffix}`
  }
  return null
}

/**
 * Сверяет фактические импорты файлов с контрактом ДО выдачи проекта.
 * Возвращает список расхождений; пустой список = импорты согласованы.
 *
 * Намеренно НЕ дублирует `explainBuildIntegrity` (он проверяет уже собранный
 * набор через TS AST). Здесь дешёвая текстовая сверка, работающая и тогда,
 * когда файла-цели ещё не существует — то есть до того, как дефект родится.
 */
export function verifyAgainstContract(files: SourceFile[], contract: ExportContract): ContractViolation[] {
  const violations: ContractViolation[] = []
  const known = new Set(files.map((f) => normalize(f.path)))

  for (const file of files) {
    const path = normalize(file.path)
    if (!/\.tsx?$/.test(path)) continue
    if (isFrameworkConfig(path)) continue // tailwind.config.ts и родня — не файлы приложения

    /* --- обязательные экспорты самого файла --- */
    const shape = contract.byPath.get(path)
    if (shape) {
      if (shape.requiresDefault && !/^\s*export\s+default\s/m.test(file.content)) {
        violations.push({
          kind: "missing-export",
          file: path,
          symbol: shape.symbol,
          message: `файл обязан отдавать "export default ${shape.symbol}" по контракту, но default-экспорта нет`,
        })
      }
      if (
        shape.requiresNamed &&
        !new RegExp(`export\\s+(async\\s+)?(function|const|class|type|interface)\\s+${shape.symbol}\\b`).test(file.content) &&
        !new RegExp(`export\\s*\\{[^}]*\\b${shape.symbol}\\b`).test(file.content)
      ) {
        violations.push({
          kind: "missing-export",
          file: path,
          symbol: shape.symbol,
          message: `файл обязан отдавать именованный "${shape.symbol}" по контракту, но такого экспорта нет`,
        })
      }
    }

    /* --- импорты файла --- */
    IMPORT_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IMPORT_RE.exec(file.content)) !== null) {
      const clause = match[1]
      const spec = match[2]

      if (!isLocalSpec(spec)) {
        const pkg = spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]
        if (!BUILTIN_PACKAGES.has(pkg)) {
          violations.push({
            kind: "unknown-import",
            file: path,
            message: `пакет "${pkg}" не входит в каркас приложения (доступны только next, react, react-dom)`,
          })
        }
        continue
      }

      const target = resolveContractPath(spec, path, known)
      if (!target) {
        violations.push({
          kind: "unknown-import",
          file: path,
          message: `импорт "${spec}" не разрешается ни в один файл приложения — сборка упадёт с "Module not found"`,
          missingPath: spec.startsWith("@/") ? `${normalize(spec.slice(2))}.tsx` : undefined,
        })
        continue
      }

      const targetShape = contract.byPath.get(target)
      if (!targetShape) continue

      const wantsDefault = /^\s*[A-Za-z_$][\w$]*\s*(,|$)/.test(clause.trim())
      const namedMatch = clause.match(/\{([^}]*)\}/)

      if (wantsDefault && !targetShape.requiresDefault) {
        violations.push({
          kind: "wrong-import-form",
          file: path,
          symbol: targetShape.symbol,
          message: `импортирует default из "${target}", а файл по контракту отдаёт только именованный "${targetShape.symbol}" — нужно ${targetShape.importLine}`,
        })
      }

      if (namedMatch && !targetShape.requiresNamed) {
        violations.push({
          kind: "wrong-import-form",
          file: path,
          symbol: targetShape.symbol,
          message: `импортирует именованный из "${target}", а файл по контракту отдаёт только default — нужно ${targetShape.importLine}`,
        })
      }
    }
  }

  return violations
}

/* ----------------------------------------------------------------
   Детерминированная досборка недостающего
   ---------------------------------------------------------------- */

/** Минимальный валидный модуль по контракту — заглушка честная, а не «//TODO».
 *  Нужна там, где модель импортировала файл, которого нет в манифесте: без него
 *  сборка падает целиком, с ним приложение собирается и работает. */
export function renderContractStub(shape: ExportShape): string {
  if (shape.requiresDefault && shape.requiresNamed) {
    return `export function ${shape.symbol}({ children }: { children?: React.ReactNode }) {
  return <div className="contents">{children}</div>
}

export default ${shape.symbol}
`
  }
  if (shape.requiresDefault) {
    return `export default function ${shape.symbol}() {
  return null
}
`
  }
  if (shape.path.startsWith("hooks/")) {
    return `export function ${shape.symbol}<T>(initial: T) {
  return initial
}
`
  }
  return `export function ${shape.symbol}(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ")
}
`
}

/**
 * Достраивает файлы, которые импортируются, но не существуют, и добавляет
 * недостающие экспорты. Детерминированно — без AI-вызовов. Возвращает новый
 * набор файлов и список выполненных действий.
 */
export function reconcileWithContract(
  files: SourceFile[],
  contract: ExportContract,
): { files: SourceFile[]; actions: string[]; contract: ExportContract } {
  const actions: string[] = []
  const out = files.map((f) => ({ path: normalize(f.path), content: f.content }))
  const known = new Set(out.map((f) => f.path))

  /* 1. Досборка файлов, которых импортируют, но которых нет. */
  for (const file of [...out]) {
    if (!/\.tsx?$/.test(file.path)) continue
    IMPORT_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = IMPORT_RE.exec(file.content)) !== null) {
      const spec = match[2]
      if (!isLocalSpec(spec)) continue
      if (resolveContractPath(spec, file.path, known)) continue

      // Целевой путь выводим из спецификатора: только внутрь проекта.
      let base: string
      if (spec.startsWith("@/")) base = normalize(spec.slice(2))
      else if (spec.startsWith("/")) base = normalize(spec.slice(1))
      else {
        const dir = file.path.includes("/") ? file.path.slice(0, file.path.lastIndexOf("/")) : ""
        base = normalize(`${dir}/${spec}`)
          .split("/")
          .reduce<string[]>((acc, part) => {
            if (part === "..") acc.pop()
            else if (part !== ".") acc.push(part)
            return acc
          }, [])
          .join("/")
      }
      if (!base || !/^(app|components|hooks|lib|utils|types)\//.test(base)) continue

      const wantsJsx = /\.tsx$/.test(file.path) && !base.startsWith("lib/") && !base.startsWith("utils/") && !base.startsWith("hooks/")
      const targetPath = `${base}${wantsJsx ? ".tsx" : ".ts"}`
      if (known.has(targetPath)) continue

      const shape = shapeFor(targetPath)
      // Форму берём из того, КАК его импортируют: контракт обязан совпасть с местом вызова.
      const clause = match[1]
      const namedMatch = clause.match(/\{([^}]*)\}/)
      const defaultName = clause.trim().match(/^([A-Za-z_$][\w$]*)/)?.[1] ?? null

      const resolved: ExportShape = {
        ...shape,
        requiresDefault: shape.requiresDefault || !!defaultName,
        requiresNamed: shape.requiresNamed || !!namedMatch,
        symbol: namedMatch?.[1]?.split(",")[0]?.trim().split(/\s+as\s+/)[0]?.trim() || defaultName || shape.symbol,
      }
      resolved.importLine = resolved.requiresDefault
        ? `import ${resolved.symbol} from "${resolved.importSpec}"`
        : `import { ${resolved.symbol} } from "${resolved.importSpec}"`

      out.push({ path: targetPath, content: renderContractStub(resolved) })
      known.add(targetPath)
      contract.files.push(resolved)
      contract.byPath.set(targetPath, resolved)
      actions.push(`досоздан ${targetPath} по контракту (импортировался из ${file.path}, но не был сгенерирован)`)
    }
  }

  /* 1.1. Дубль объявления символа.
     Найдено НАСТОЯЩЕЙ сборкой (next build), а не разбором: модель, стараясь
     выполнить контракт двойного экспорта, дописывала в конец файла

         export default NotesList;
         export function NotesList() {        // ← второе объявление того же имени
           // Re-export for named import compatibility
           return <NotesList />;              // ← и бесконечная рекурсия
         }

     Граф модулей такой файл считает валидным (символ экспортируется!), а webpack
     падает на "`NotesList` redefined here". Правильный реэкспорт — `export { X }`,
     а не повторное объявление. Срезаем дубль, оставляя первое объявление.

     Сюда же — коллизия объявления с ИМПОРТИРОВАННЫМ именем (`import { Search }`
     + `function Search()`): для webpack это то же самое "redefined".

     Два прохода: после переименования позиции в тексте сдвигаются, поэтому дубли
     такого файла добираются на втором круге. Больше двух не нужно — правило
     идемпотентно, третий проход всегда пустой. */
  for (let pass = 0; pass < 2; pass++)
  for (const file of out) {
    if (!/\.tsx?$/.test(file.path) || isFrameworkConfig(file.path)) continue

    /* Границы блока ищем КОМПИЛЯТОРОМ, а не счётчиком скобок: наивный баланс `{`
       ломается о строки, шаблоны и JSX (проверено — резал файлы посреди разметки).
       TypeScript даёт точные позиции объявлений верхнего уровня. Нет компилятора
       в рантайме — правило просто не работает, файл остаётся как есть. */
    const ts = loadTs()
    if (!ts) continue

    const sf = ts.createSourceFile(
      file.path,
      file.content,
      ts.ScriptTarget.Latest,
      true,
      file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )

    /* Имена, занятые импортами: коллизия объявления с импортом — тот же webpack
       "redefined". Реальный случай живого прогона: `import { Search } from
       "lucide-react"` и `export default function Search()` в одном файле. */
    const importedNames = new Set<string>()
    for (const stmt of sf.statements) {
      if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
      if (stmt.importClause.name) importedNames.add(stmt.importClause.name.text)
      const bindings = stmt.importClause.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) importedNames.add(bindings.name.text)
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) importedNames.add(el.name.text)
      }
    }

    const seen = new Set<string>()
    const duplicates: Array<{ symbol: string; start: number; end: number }> = []
    const collisions: Array<{ symbol: string; nameStart: number; nameEnd: number }> = []
    for (const stmt of sf.statements) {
      let symbol: string | null = null
      let nameNode: import("typescript").Identifier | undefined

      if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
        nameNode = stmt.name
        symbol = stmt.name?.text ?? null
      }

      /* Переменные считаем тоже: модель пишет и `const X = X` — самоприсваивание,
         которое webpack справедливо считает переопределением. Такой стейтмент
         бессмыслен всегда (значение — он сам), поэтому срезаем его целиком, даже
         если это первое вхождение имени. */
      if (ts.isVariableStatement(stmt)) {
        const decls = stmt.declarationList.declarations
        const selfAssigned = decls.some(
          (d) =>
            ts.isIdentifier(d.name) &&
            d.initializer &&
            ts.isIdentifier(d.initializer) &&
            d.initializer.text === d.name.text,
        )
        if (selfAssigned && decls.length === 1) {
          duplicates.push({
            symbol: ts.isIdentifier(decls[0].name) ? decls[0].name.text : "?",
            start: stmt.getStart(sf),
            end: stmt.getEnd(),
          })
          continue
        }
        const first = decls[0]
        if (decls.length === 1 && ts.isIdentifier(first.name)) {
          nameNode = first.name
          symbol = first.name.text
        }
      }

      if (!symbol) continue
      if (importedNames.has(symbol) && nameNode) {
        collisions.push({ symbol, nameStart: nameNode.getStart(sf), nameEnd: nameNode.getEnd() })
        continue
      }
      if (seen.has(symbol)) {
        duplicates.push({ symbol, start: stmt.getStart(sf), end: stmt.getEnd() })
      } else {
        seen.add(symbol)
      }
    }

    /* Коллизия с импортом: переименовываем ОБЪЯВЛЕНИЕ, а не импорт — импортированный
       символ используется в разметке файла, а имя локальной функции роли не играет
       (для страниц App Router важен факт default-экспорта, а не его имя). */
    if (collisions.length > 0) {
      let renamed = file.content
      for (const col of [...collisions].sort((a, b) => b.nameStart - a.nameStart)) {
        let candidate = `${col.symbol}Page`
        let n = 2
        while (importedNames.has(candidate) || seen.has(candidate)) {
          candidate = `${col.symbol}Page${n}`
          n += 1
        }
        seen.add(candidate)
        renamed = renamed.slice(0, col.nameStart) + candidate + renamed.slice(col.nameEnd)
        actions.push(
          `${file.path}: объявление "${col.symbol}" переименовано в "${candidate}" — имя занято импортом (webpack: redefined)`,
        )
      }
      file.content = renamed
      // Позиции дублей считались по исходному тексту и после переименования уже
      // не валидны — дубли этого файла доберёт второй проход.
      continue
    }

    if (duplicates.length === 0) continue

    // Режем с конца, чтобы позиции ранних объявлений не сдвигались.
    let content = file.content
    const cutSymbols: string[] = []
    for (const dup of [...duplicates].sort((a, b) => b.start - a.start)) {
      content = `${content.slice(0, dup.start).trimEnd()}\n${content.slice(dup.end).replace(/^[ \t]*;?[ \t]*\n?/, "")}`
      cutSymbols.push(dup.symbol)
    }
    if (cutSymbols.length === 0) continue

    // Контрактный именованный экспорт мог жить именно в срезанном дубле —
    // восстанавливаем его корректной формой.
    const shape = contract.byPath.get(file.path)
    if (
      shape?.requiresNamed &&
      !new RegExp(`export\\s+(?:async\\s+)?(?:function|const|class)\\s+${shape.symbol}\\b`).test(content) &&
      !new RegExp(`export\\s*\\{[^}]*\\b${shape.symbol}\\b`).test(content) &&
      new RegExp(`(?:function|const|class)\\s+${shape.symbol}\\b`).test(content)
    ) {
      content = `${content.trimEnd()}\n\nexport { ${shape.symbol} }\n`
    }

    file.content = content
    actions.push(
      `${file.path}: срезано повторное объявление ${[...new Set(cutSymbols)].map((s) => `"${s}"`).join(", ")} (webpack: redefined)`,
    )
  }

  /* 1.2. Сторонние пакеты вне каркаса → встроенный аналог.
     Модель регулярно тянет мелкие утилитарные пакеты (uuid, clsx, classnames,
     nanoid) — их нет в package.json, и `npm install` + сборка падают. Держать
     гонку «добавь ещё один пакет в каркас» бессмысленно: класс закрывается
     детерминированной заменой на то, что уже есть в рантайме. Замена точечная и
     семантически эквивалентная, а не «удалим импорт и посмотрим». */
  for (const file of out) {
    if (!/\.tsx?$/.test(file.path) || isFrameworkConfig(file.path)) continue

    let content = file.content
    const replaced: string[] = []

    // uuid → crypto.randomUUID() (доступен в браузере и в Node ≥ 16)
    content = content.replace(
      /^\s*import\s*\{[^}]*\bv4\s+as\s+(\w+)[^}]*\}\s*from\s*["']uuid["'];?\s*$/gm,
      (_m, alias) => {
        replaced.push("uuid → crypto.randomUUID()")
        return `const ${alias} = (): string => crypto.randomUUID()`
      },
    )
    content = content.replace(/^\s*import\s*\{\s*v4\s*\}\s*from\s*["']uuid["'];?\s*$/gm, () => {
      replaced.push("uuid → crypto.randomUUID()")
      return `const v4 = (): string => crypto.randomUUID()`
    })

    // nanoid → та же встроенная генерация идентификаторов
    content = content.replace(/^\s*import\s*\{\s*nanoid\s*\}\s*from\s*["']nanoid["'];?\s*$/gm, () => {
      replaced.push("nanoid → crypto.randomUUID()")
      return `const nanoid = (): string => crypto.randomUUID().replace(/-/g, "").slice(0, 12)`
    })

    // clsx / classnames → локальная склейка классов (ровно то, что они делают)
    content = content.replace(
      /^\s*import\s+(\w+)\s+from\s*["'](?:clsx|classnames)["'];?\s*$/gm,
      (_m, alias) => {
        replaced.push("clsx/classnames → локальная склейка классов")
        return `const ${alias} = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ")`
      },
    )
    content = content.replace(/^\s*import\s*\{\s*clsx\s*\}\s*from\s*["']clsx["'];?\s*$/gm, () => {
      replaced.push("clsx → локальная склейка классов")
      return `const clsx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(" ")`
    })

    if (replaced.length > 0) {
      file.content = content
      actions.push(`${file.path}: ${[...new Set(replaced)].join(", ")} (пакета нет в каркасе приложения)`)
    }
  }

  /* 1.5. Распространение "use client" по графу импортов.
     Директива клиента — тоже контракт МЕЖДУ файлами, а не свойство одного файла:
     если `hooks/useStats.ts` импортирует `hooks/useHabits.ts` с "use client", он
     сам обязан быть клиентским, иначе next build падает на
     "You're importing a component that needs useState". Параллельная генерация
     этого согласовать не может в принципе — каждый файл видит только себя.
     Чиним детерминированно и транзитивно, до неподвижной точки. */
  const isClient = (content: string): boolean => /^\s*["']use client["']/.test(content)
  const hasHookUsage = (content: string): boolean => /\buse[A-Z]\w*\s*\(/.test(content)
  /** Обработчик события в JSX (`onClick={...}`) требует клиентского рантайма
   *  ровно так же, как хук — это второй источник use-client-missing на живом прогоне. */
  const hasJsxHandler = (content: string): boolean => /\son[A-Z]\w*\s*=\s*\{/.test(content)

  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const file of out) {
      if (!/\.tsx?$/.test(file.path) || isClient(file.content)) continue
      if (isFrameworkConfig(file.path)) continue
      // Страницы с экспортом metadata клиентскими делать нельзя — там нужен
      // разрез компонента, это уже забота инженерного контура, не досборки.
      if (/export\s+const\s+metadata\b/.test(file.content)) continue

      IMPORT_RE.lastIndex = 0
      let match: RegExpExecArray | null
      let needsClient = false
      while ((match = IMPORT_RE.exec(file.content)) !== null) {
        const spec = match[2]
        if (!isLocalSpec(spec)) continue
        const target = resolveContractPath(spec, file.path, known)
        if (!target) continue
        const targetFile = out.find((f) => f.path === target)
        if (targetFile && isClient(targetFile.content)) {
          needsClient = true
          break
        }
      }
      // Собственные хуки или обработчики событий в файле без директивы — тот же дефект.
      if (!needsClient && (hasHookUsage(file.content) || hasJsxHandler(file.content))) {
        needsClient = true
      }
      if (!needsClient) continue

      file.content = `"use client"\n\n${file.content.replace(/^﻿/, "")}`
      actions.push(`${file.path}: добавлена директива "use client" (импортирует клиентский модуль)`)
      changed = true
    }
    if (!changed) break
  }

  /* 2. Дописывание недостающих экспортов там, где это безопасно. */
  for (const file of out) {
    const shape = contract.byPath.get(file.path)
    if (!shape || !/\.tsx?$/.test(file.path)) continue

    const hasDefault = /^\s*export\s+default\s/m.test(file.content)
    const hasNamed =
      new RegExp(`export\\s+(async\\s+)?(function|const|class|type|interface)\\s+${shape.symbol}\\b`).test(file.content) ||
      new RegExp(`export\\s*\\{[^}]*\\b${shape.symbol}\\b`).test(file.content)

    // Именованный есть, default требуется — дописываем реэкспорт.
    if (shape.requiresDefault && !hasDefault && hasNamed) {
      file.content = `${file.content.trimEnd()}\n\nexport default ${shape.symbol}\n`
      actions.push(`${file.path}: дописан "export default ${shape.symbol}" по контракту`)
      continue
    }

    // Default есть, именованный требуется — реэкспортируем локальное объявление.
    if (shape.requiresNamed && !hasNamed && hasDefault) {
      const declared = new RegExp(`(?:function|const|class)\\s+(${shape.symbol})\\b`).test(file.content)
      if (declared) {
        file.content = `${file.content.trimEnd()}\n\nexport { ${shape.symbol} }\n`
        actions.push(`${file.path}: дописан именованный экспорт "${shape.symbol}" по контракту`)
      }
    }
  }

  return { files: out, actions, contract }
}
