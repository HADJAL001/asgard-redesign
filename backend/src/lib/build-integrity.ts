import { captureError } from "./sentry"
import { propsContractDefects, repairPropValue } from "./props-contract"

/* ================================================================
   OSGARD · Инженерная целостность сгенерированного приложения
   ----------------------------------------------------------------
   ЗАЧЕМ. До этого модуля единственной проверкой сгенерированного кода
   был `ts.transpileModule` (validateGeneratedFiles в app-generator):
   он видит ОДИН файл и только его синтаксис. Между тем файлы
   приложения генерируются ПАРАЛЛЕЛЬНО и вслепую друг к другу —
   и ломается приложение как раз на стыках, которые transpileModule
   увидеть физически не может:

     • `import Hero from "./Hero"`, а Hero.tsx в наборе нет
       → next build: "Module not found" (сборка падает);
     • `import { Card } from "./Card"`, а Card.tsx отдаёт только default
       → элемент undefined → prerender падает на экспорте;
     • компонент с useState без директивы "use client"
       → next build: "You're importing a component that needs useState";
     • `import { motion } from "framer-motion"`, которого нет в
       package.json → "Module not found" на установке;
     • `app/api/**`, "use server", force-dynamic при output:"export"
       → статический экспорт невозможен.

   Всё это ДЕТЕРМИНИРОВАННО вычислимо из самого набора файлов, без
   Docker и без npm install — то есть работает и в проде (Railway,
   где Docker-демона нет), а не только на машине с песочницей.

   Разбор строится на AST TypeScript (`ts.createSourceFile`), а не на
   регулярках: импорты/экспорты/директивы/хуки — это структура, и
   читать её надо структурно, иначе ложные срабатывания на строках и
   комментариях. Балл не выдумывается: `ok` производен от списка
   дефектов (приём из lib/proof-of-craft.ts и lib/design-qa.ts).

   Часть дефектов чинится МЕХАНИЧЕСКИ, без AI и без потери смысла
   (см. repairIntegrity): дописать "use client", дописать default-
   экспорт, перевести именованный импорт в default, снести api-роут,
   срезать утёкший markdown-фенс. Остальное честно уезжает в
   AI-ремонт или в честный вердикт «broken» — см. project-engineering.
   ================================================================ */

export type IntegritySeverity = "error" | "warn"

export type IntegrityDefect = {
  /** Машинный идентификатор правила (стабильный, попадает в отчёт и тесты). */
  rule: string
  severity: IntegritySeverity
  /** Файл, который надо чинить (не тот, где симптом виден). */
  file: string
  line?: number
  message: string
  /** true — чинится детерминированно в repairIntegrity, без обращения к AI. */
  autoFixable: boolean
  /** Служебные данные для механического ремонта (имя символа, путь цели и т.п.). */
  hint?: Record<string, string>
}

export type IntegrityCheck = {
  key: string
  label: string
  passed: boolean
  errors: number
  warnings: number
  detail: string
}

export type IntegrityReport = {
  /** Нет ни одного дефекта уровня error — приложение имеет право собираться. */
  ok: boolean
  /** false — TypeScript недоступен в рантайме, разбор не проводился (не путать с ok). */
  analyzed: boolean
  checks: IntegrityCheck[]
  defects: IntegrityDefect[]
  analyzedFiles: number
}

export type SourceFile = { path: string; content: string }

/* ----------------------------------------------------------------
   Загрузка компилятора
   ---------------------------------------------------------------- */

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

/* ----------------------------------------------------------------
   Пути и разрешение импортов
   ---------------------------------------------------------------- */

const CODE_RE = /\.tsx?$/
const DECLARATION_RE = /\.d\.ts$/

function isCodeFile(path: string): boolean {
  return CODE_RE.test(path) && !DECLARATION_RE.test(path)
}

/** posix-нормализация пути без обращения к ФС (файлы живут в БД, не на диске). */
function normalizePath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/")
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === ".") continue
    if (part === "..") out.pop()
    else out.push(part)
  }
  return out.join("/")
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/")
  return i === -1 ? "" : p.slice(0, i)
}

function basenameNoExt(p: string): string {
  const base = p.slice(p.lastIndexOf("/") + 1)
  return base.replace(/\.[^.]+$/, "")
}

/** Пакет из спецификатора: "next/font/google" → "next", "@scope/pkg/x" → "@scope/pkg". */
function packageOf(spec: string): string {
  const parts = spec.split("/")
  return spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

/** Всегда доступные пакеты каркаса (их ставит staticTemplateFiles).
 *  lucide-react входит в каркас: модели тянут иконки практически в каждом
 *  приложении, и без объявления пакета каждый такой импорт был ошибкой сборки. */
const BUILTIN_PACKAGES = new Set(["next", "react", "react-dom", "typescript", "lucide-react"])

const RESOLVE_SUFFIXES = ["", ".tsx", ".ts", "/index.tsx", "/index.ts", ".css", ".json"]

/** Разрешает относительный/алиасный импорт в путь файла набора. null — не найден. */
function resolveLocal(spec: string, fromPath: string, index: Map<string, SourceFile>): string | null {
  let base: string
  if (spec.startsWith("@/")) base = normalizePath(spec.slice(2))
  else if (spec.startsWith("/")) base = normalizePath(spec.slice(1))
  else base = normalizePath(`${dirname(fromPath)}/${spec}`)

  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${base}${suffix}`
    if (index.has(candidate)) return candidate
  }
  return null
}

function isLocalSpec(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("/")
}

/* ----------------------------------------------------------------
   Разбор одного файла в факты (AST)
   ---------------------------------------------------------------- */

type ImportRef = {
  spec: string
  line: number
  typeOnly: boolean
  defaultName: string | null
  namespace: string | null
  named: Array<{ name: string; alias: string }>
}

type FileFacts = {
  path: string
  hasUseClient: boolean
  hasUseServer: boolean
  hasDefaultExport: boolean
  /** Имя компонента-кандидата на default-экспорт (для механического ремонта). */
  defaultCandidate: string | null
  namedExports: Set<string>
  /** `export * from "..."` — состав экспортов знать нельзя, именованные не проверяем. */
  hasStarReexport: boolean
  imports: ImportRef[]
  hooks: string[]
  hooksLine: number | null
  /** Браузерные API на верхнем уровне модуля (падение при prerender). */
  browserTopLevel: Array<{ name: string; line: number }>
  hasJsxHandlers: boolean
  jsxHandlerLine: number | null
  hasMetadataExport: boolean
  hasGenerateStaticParams: boolean
  hasDynamicFlag: { line: number; name: string } | null
  /** Первая строка кода (куда безопасно вставлять директиву). */
  syntaxOk: boolean
}

const BROWSER_GLOBALS = new Set(["window", "document", "localStorage", "sessionStorage", "navigator"])
const HOOK_RE = /^use[A-Z]/

function analyzeFile(ts: typeof import("typescript"), file: SourceFile): FileFacts {
  const facts: FileFacts = {
    path: file.path,
    hasUseClient: false,
    hasUseServer: false,
    hasDefaultExport: false,
    defaultCandidate: null,
    namedExports: new Set(),
    hasStarReexport: false,
    imports: [],
    hooks: [],
    hooksLine: null,
    browserTopLevel: [],
    hasJsxHandlers: false,
    jsxHandlerLine: null,
    hasMetadataExport: false,
    hasGenerateStaticParams: false,
    hasDynamicFlag: null,
    syntaxOk: true,
  }

  const sf = ts.createSourceFile(
    file.path,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const lineOf = (node: import("typescript").Node): number => {
    try {
      return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1
    } catch {
      return 1
    }
  }

  // Директивный пролог: "use client" / "use server" в начале файла.
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === "use client") facts.hasUseClient = true
      if (stmt.expression.text === "use server") facts.hasUseServer = true
      continue
    }
    break // пролог кончился на первом не-строковом стейтменте
  }

  const hasExportModifier = (node: import("typescript").Node): boolean =>
    !!ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  const hasDefaultModifier = (node: import("typescript").Node): boolean =>
    !!ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)

  for (const stmt of sf.statements) {
    /* --- импорты --- */
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier)) {
      const ref: ImportRef = {
        spec: stmt.moduleSpecifier.text,
        line: lineOf(stmt),
        typeOnly: !!stmt.importClause?.isTypeOnly,
        defaultName: stmt.importClause?.name?.text ?? null,
        namespace: null,
        named: [],
      }
      const bindings = stmt.importClause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings)) ref.namespace = bindings.name.text
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (el.isTypeOnly) continue // типы стираются, next.config игнорирует ошибки типов
          ref.named.push({ name: (el.propertyName ?? el.name).text, alias: el.name.text })
        }
      }
      facts.imports.push(ref)
      continue
    }

    /* --- re-export: `export ... from "..."` --- */
    if (ts.isExportDeclaration(stmt)) {
      if (stmt.moduleSpecifier && ts.isStringLiteral(stmt.moduleSpecifier)) {
        facts.imports.push({
          spec: stmt.moduleSpecifier.text,
          line: lineOf(stmt),
          typeOnly: !!stmt.isTypeOnly,
          defaultName: null,
          namespace: null,
          named: [],
        })
        if (!stmt.exportClause) facts.hasStarReexport = true
      }
      if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) facts.namedExports.add(el.name.text)
      }
      continue
    }

    /* --- export default <expr> --- */
    if (ts.isExportAssignment(stmt) && !stmt.isExportEquals) {
      facts.hasDefaultExport = true
      continue
    }

    /* --- объявления с модификаторами export/default --- */
    if (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) {
      const name = stmt.name?.text
      if (hasExportModifier(stmt)) {
        if (hasDefaultModifier(stmt)) facts.hasDefaultExport = true
        else if (name) facts.namedExports.add(name)
      }
      if (name && /^[A-Z]/.test(name) && !facts.defaultCandidate) facts.defaultCandidate = name
      if (name === "generateStaticParams") facts.hasGenerateStaticParams = true
      continue
    }

    if (ts.isVariableStatement(stmt)) {
      const exported = hasExportModifier(stmt)
      for (const decl of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue
        const name = decl.name.text
        if (exported) {
          facts.namedExports.add(name)
          if (name === "metadata") facts.hasMetadataExport = true
          if (name === "generateStaticParams") facts.hasGenerateStaticParams = true
          if (name === "dynamic" || name === "revalidate" || name === "fetchCache") {
            const init = decl.initializer
            const isDynamicValue =
              name !== "dynamic" || (init && ts.isStringLiteral(init) && init.text !== "force-static")
            if (isDynamicValue) facts.hasDynamicFlag = { line: lineOf(stmt), name }
          }
        }
        if (/^[A-Z]/.test(name) && !facts.defaultCandidate) facts.defaultCandidate = name
      }
      continue
    }
  }

  /* --- обход тела: хуки, браузерные глобалы верхнего уровня, JSX-обработчики --- */
  let functionDepth = 0
  const visit = (node: import("typescript").Node): void => {
    const opensScope =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessor(node) ||
      ts.isSetAccessor(node) ||
      ts.isConstructorDeclaration(node)

    if (opensScope) functionDepth += 1

    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && HOOK_RE.test(node.expression.text)) {
      facts.hooks.push(node.expression.text)
      if (facts.hooksLine === null) facts.hooksLine = lineOf(node)
    }

    if (ts.isIdentifier(node) && BROWSER_GLOBALS.has(node.text) && functionDepth === 0) {
      // Идентификатор в позиции обращения (не имя свойства/параметра/объявления).
      const parent = node.parent
      const isPropertyName =
        parent && ts.isPropertyAccessExpression(parent) && parent.name === node
      const isDeclarationName =
        parent &&
        ((ts.isVariableDeclaration(parent) && parent.name === node) ||
          (ts.isParameter(parent) && parent.name === node) ||
          (ts.isBindingElement(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          ts.isImportSpecifier(parent))
      if (!isPropertyName && !isDeclarationName) {
        facts.browserTopLevel.push({ name: node.text, line: lineOf(node) })
      }
    }

    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && /^on[A-Z]/.test(node.name.text)) {
      facts.hasJsxHandlers = true
      if (facts.jsxHandlerLine === null) facts.jsxHandlerLine = lineOf(node)
    }

    ts.forEachChild(node, visit)
    if (opensScope) functionDepth -= 1
  }
  ts.forEachChild(sf, visit)

  return facts
}

/* ----------------------------------------------------------------
   Проверки
   ---------------------------------------------------------------- */

/** Зависимости, объявленные в package.json набора (плюс каркасные). */
function declaredPackages(index: Map<string, SourceFile>): Set<string> {
  const pkgs = new Set<string>(BUILTIN_PACKAGES)
  const pkg = index.get("package.json")
  if (!pkg) return pkgs
  try {
    const parsed = JSON.parse(pkg.content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    for (const key of Object.keys(parsed.dependencies ?? {})) pkgs.add(key)
    for (const key of Object.keys(parsed.devDependencies ?? {})) pkgs.add(key)
  } catch {
    // битый package.json ловится отдельным правилом ниже
  }
  return pkgs
}

/** Синтаксис каждого файла (тот же transpileModule, но с привязкой к правилу). */
function syntaxDefects(ts: typeof import("typescript"), files: SourceFile[]): IntegrityDefect[] {
  const defects: IntegrityDefect[] = []
  for (const file of files) {
    if (!isCodeFile(file.path)) continue
    try {
      const result = ts.transpileModule(file.content, {
        reportDiagnostics: true,
        compilerOptions: { jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext },
      })
      for (const d of result.diagnostics ?? []) {
        if (d.category !== ts.DiagnosticCategory.Error) continue
        defects.push({
          rule: "syntax",
          severity: "error",
          file: file.path,
          message: ts.flattenDiagnosticMessageText(d.messageText, " "),
          autoFixable: false,
        })
      }
    } catch (err: any) {
      defects.push({
        rule: "syntax",
        severity: "error",
        file: file.path,
        message: err?.message || "не удалось разобрать файл",
        autoFixable: false,
      })
    }
  }
  return defects
}

/** Граф модулей: каждый импорт обязан во что-то разрешаться. */
function moduleGraphDefects(files: FileFacts[], index: Map<string, SourceFile>, factsByPath: Map<string, FileFacts>): IntegrityDefect[] {
  const defects: IntegrityDefect[] = []
  const packages = declaredPackages(index)

  for (const facts of files) {
    for (const ref of facts.imports) {
      if (isLocalSpec(ref.spec)) {
        const target = resolveLocal(ref.spec, facts.path, index)
        if (!target) {
          defects.push({
            rule: "import-missing",
            severity: "error",
            file: facts.path,
            line: ref.line,
            message: `импорт "${ref.spec}" не разрешается ни в один файл проекта — next build упадёт с "Module not found"`,
            autoFixable: false,
            hint: { spec: ref.spec },
          })
          continue
        }
        if (ref.typeOnly) continue

        const targetFacts = factsByPath.get(target)
        if (!targetFacts) continue // .css/.json — состав экспортов не проверяем

        if (ref.defaultName && !targetFacts.hasDefaultExport) {
          const named = targetFacts.namedExports.has(ref.defaultName)
            ? ref.defaultName
            : targetFacts.defaultCandidate && targetFacts.namedExports.has(targetFacts.defaultCandidate)
              ? targetFacts.defaultCandidate
              : null
          defects.push({
            rule: "default-export-missing",
            severity: "error",
            file: target,
            line: 1,
            message: named
              ? `"${facts.path}" импортирует default, но файл отдаёт только именованный "${named}" — при рендере компонент будет undefined`
              : `"${facts.path}" импортирует default, которого в файле нет`,
            autoFixable: !!named,
            hint: named ? { symbol: named } : undefined,
          })
        }

        if (!targetFacts.hasStarReexport) {
          for (const spec of ref.named) {
            if (targetFacts.namedExports.has(spec.name)) continue
            const fixable = targetFacts.hasDefaultExport && ref.named.length === 1 && !ref.defaultName
            defects.push({
              rule: "named-import-missing",
              severity: "error",
              file: facts.path,
              line: ref.line,
              message: fixable
                ? `"${spec.name}" импортируется как именованный, а "${target}" отдаёт default — импорт нужно переписать`
                : `"${spec.name}" не экспортируется из "${target}"`,
              autoFixable: fixable,
              hint: { spec: ref.spec, symbol: spec.name, alias: spec.alias },
            })
          }
        }
        continue
      }

      const pkg = packageOf(ref.spec)
      if (!packages.has(pkg)) {
        defects.push({
          rule: "dependency-missing",
          severity: "error",
          file: facts.path,
          line: ref.line,
          message: `пакет "${pkg}" не объявлен в package.json — установка и сборка приложения упадут`,
          autoFixable: false,
          hint: { package: pkg },
        })
      }
    }
  }

  return defects
}

/** Контракт клиент/сервер App Router. */
function clientBoundaryDefects(files: FileFacts[]): IntegrityDefect[] {
  const defects: IntegrityDefect[] = []
  for (const facts of files) {
    const needsClient = facts.hooks.length > 0 || facts.hasJsxHandlers
    if (needsClient && !facts.hasUseClient) {
      if (facts.hasMetadataExport) {
        defects.push({
          rule: "client-metadata-conflict",
          severity: "error",
          file: facts.path,
          line: facts.hooksLine ?? facts.jsxHandlerLine ?? 1,
          message:
            'файл экспортирует metadata и одновременно требует клиентского рантайма — "use client" сюда добавить нельзя, интерактив нужно вынести в отдельный компонент',
          autoFixable: false,
        })
      } else {
        const reason = facts.hooks.length > 0 ? `хук ${facts.hooks[0]}` : "обработчик события в JSX"
        defects.push({
          rule: "use-client-missing",
          severity: "error",
          file: facts.path,
          line: facts.hooksLine ?? facts.jsxHandlerLine ?? 1,
          message: `${reason} в серверном компоненте — next build остановится на "You're importing a component that needs ${facts.hooks[0] ?? "an event handler"}"`,
          autoFixable: true,
        })
      }
    }

    if (facts.browserTopLevel.length > 0) {
      const first = facts.browserTopLevel[0]
      defects.push({
        rule: "browser-global-toplevel",
        severity: "error",
        file: facts.path,
        line: first.line,
        message: `обращение к ${first.name} на верхнем уровне модуля — при статическом рендере страницы этого объекта нет, сборка упадёт (перенеси в useEffect или обработчик)`,
        autoFixable: false,
      })
    }
  }
  return defects
}

/** Контракт статического экспорта (next.config: output "export"). */
function staticExportDefects(files: FileFacts[]): IntegrityDefect[] {
  const defects: IntegrityDefect[] = []
  for (const facts of files) {
    if (/^app\/api\//.test(facts.path)) {
      defects.push({
        rule: "api-route-unsupported",
        severity: "error",
        file: facts.path,
        message: "серверный роут в приложении со статическим экспортом — такой файл не соберётся и работать не будет",
        autoFixable: true,
      })
    }

    if (facts.hasUseServer) {
      defects.push({
        rule: "server-action-unsupported",
        severity: "error",
        file: facts.path,
        line: 1,
        message: '"use server" (Server Action) несовместим со статическим экспортом',
        autoFixable: false,
      })
    }

    if (facts.imports.some((i) => i.spec === "next/headers" || i.spec.startsWith("next/headers/"))) {
      defects.push({
        rule: "server-only-api",
        severity: "error",
        file: facts.path,
        message: "next/headers (cookies/headers) недоступен при статическом экспорте",
        autoFixable: false,
      })
    }

    if (facts.hasDynamicFlag) {
      defects.push({
        rule: "dynamic-flag-unsupported",
        severity: "error",
        file: facts.path,
        line: facts.hasDynamicFlag.line,
        message: `export const ${facts.hasDynamicFlag.name} несовместим с output: "export" — страница не экспортируется`,
        autoFixable: true,
        hint: { symbol: facts.hasDynamicFlag.name },
      })
    }

    // Динамический сегмент маршрута без generateStaticParams не экспортируется.
    if (/^app\/.*\[[^\]]+\].*\/page\.tsx$/.test(facts.path) && !facts.hasGenerateStaticParams) {
      defects.push({
        rule: "dynamic-route-unexportable",
        severity: "error",
        file: facts.path,
        message:
          "динамический маршрут без generateStaticParams — при статическом экспорте Next.js не знает, какие страницы генерировать",
        autoFixable: false,
      })
    }
  }
  return defects
}

/** Обязательные экспорты App Router. */
function routeContractDefects(files: FileFacts[]): IntegrityDefect[] {
  const defects: IntegrityDefect[] = []
  let hasRootPage = false

  for (const facts of files) {
    const isRouteFile = /^app\/.*(page|layout|template|error|loading|not-found)\.tsx$/.test(facts.path)
    if (facts.path === "app/page.tsx") hasRootPage = true
    if (!isRouteFile) continue

    if (!facts.hasDefaultExport) {
      defects.push({
        rule: "route-default-export-missing",
        severity: "error",
        file: facts.path,
        message: `${facts.path} обязан отдавать компонент через export default — иначе маршрут не существует`,
        autoFixable: !!facts.defaultCandidate,
        hint: facts.defaultCandidate ? { symbol: facts.defaultCandidate } : undefined,
      })
    }
  }

  if (files.length === 0) {
    // Ни одного файла кода — это не «чисто», это провал генерации.
    defects.push({
      rule: "no-source-files",
      severity: "error",
      file: "app/page.tsx",
      message: "в наборе нет ни одного файла кода — приложения не существует",
      autoFixable: false,
    })
  } else if (!hasRootPage) {
    defects.push({
      rule: "root-page-missing",
      severity: "error",
      file: "app/page.tsx",
      message: "у приложения нет главной страницы app/page.tsx",
      autoFixable: false,
    })
  }

  return defects
}

const FENCE_RE = /^\s*```/m
const PLACEHOLDER_RE = /(\/\/|\{\s*\/\*)\s*(\.\.\.|остальн|rest of the|TODO: (implement|дописать))/i

/** Гигиена содержимого: следы ответа модели, заглушки, пустые файлы. */
function contentHygieneDefects(files: SourceFile[]): IntegrityDefect[] {
  const defects: IntegrityDefect[] = []
  for (const file of files) {
    if (!isCodeFile(file.path)) continue

    if (file.content.trim().length < 20) {
      defects.push({
        rule: "empty-file",
        severity: "error",
        file: file.path,
        message: "файл пустой или обрезан — генерация этого файла не удалась",
        autoFixable: false,
      })
      continue
    }

    if (FENCE_RE.test(file.content)) {
      defects.push({
        rule: "markdown-leak",
        severity: "error",
        file: file.path,
        message: "в исходник утёк markdown-фенс ``` из ответа модели — файл не является валидным TypeScript",
        autoFixable: true,
      })
    }

    if (PLACEHOLDER_RE.test(file.content)) {
      defects.push({
        rule: "placeholder-code",
        severity: "error",
        file: file.path,
        message: "в коде осталась заглушка вместо реализации («// ... остальной код») — приложение неполно",
        autoFixable: false,
      })
    }
  }

  // package.json обязан быть валидным JSON — иначе не установится вообще ничего.
  const pkg = files.find((f) => f.path === "package.json")
  if (pkg) {
    try {
      JSON.parse(pkg.content)
    } catch {
      defects.push({
        rule: "package-json-invalid",
        severity: "error",
        file: "package.json",
        message: "package.json не является валидным JSON",
        autoFixable: false,
      })
    }
  }

  return defects
}

/* ----------------------------------------------------------------
   Сводный разбор
   ---------------------------------------------------------------- */

type CheckSpec = { key: string; label: string; defects: IntegrityDefect[]; okDetail: string }

function toCheck(spec: CheckSpec): IntegrityCheck {
  const errors = spec.defects.filter((d) => d.severity === "error").length
  const warnings = spec.defects.length - errors
  return {
    key: spec.key,
    label: spec.label,
    passed: errors === 0,
    errors,
    warnings,
    detail:
      spec.defects.length === 0
        ? spec.okDetail
        : `нарушений: ${spec.defects.length} (${[...new Set(spec.defects.map((d) => d.rule))].join(", ")})`,
  }
}

/**
 * Полный разбор инженерной целостности набора файлов. Единственный источник
 * правды: `ok` производен от дефектов, поэтому вердикт и объяснение не могут
 * разойтись. Никогда не бросает: при отсутствии TypeScript возвращает
 * analyzed:false (честное «не проверено»), а не ложное «всё хорошо».
 */
export function explainBuildIntegrity(files: SourceFile[]): IntegrityReport {
  const ts = loadTs()
  const codeFiles = files.filter((f) => isCodeFile(f.path))

  if (!ts) {
    return {
      ok: false,
      analyzed: false,
      checks: [],
      defects: [],
      analyzedFiles: 0,
    }
  }

  const index = new Map<string, SourceFile>(files.map((f) => [normalizePath(f.path), f]))

  const factsList: FileFacts[] = []
  const factsByPath = new Map<string, FileFacts>()
  for (const file of codeFiles) {
    try {
      const facts = analyzeFile(ts, { path: normalizePath(file.path), content: file.content })
      factsList.push(facts)
      factsByPath.set(facts.path, facts)
    } catch (err) {
      captureError(`[build-integrity] не удалось разобрать ${file.path}:`, err)
    }
  }

  const syntax = syntaxDefects(ts, files)
  const graph = moduleGraphDefects(factsList, index, factsByPath)
  const boundary = clientBoundaryDefects(factsList)
  const staticExport = staticExportDefects(factsList)
  const routes = routeContractDefects(factsList)
  const hygiene = contentHygieneDefects(files)
  /* Контракт ТИПОВ ПРОПОВ (lib/props-contract). Отдельный модуль со своим разбором:
     здесь нужны сигнатуры компонентов и JSX-атрибуты, а FileFacts выше собирает
     импорты/экспорты/директивы — смешивать две разные модели одного файла дороже,
     чем распарсить его дважды (речь о десятке файлов внутри процесса).
     Нужен потому, что каркас глушит tsc через ignoreBuildErrors, а в проде нет
     Docker — значит рассогласование пропов не поймает НИКТО, кроме этой сверки. */
  const props = (() => {
    try {
      return propsContractDefects(files)
    } catch (err) {
      captureError("[build-integrity] сверка контракта пропов не удалась:", err)
      return [] as IntegrityDefect[]
    }
  })()

  const checks: IntegrityCheck[] = [
    toCheck({ key: "syntax", label: "Синтаксис", defects: syntax, okDetail: "каждый файл разбирается компилятором" }),
    toCheck({ key: "graph", label: "Граф модулей", defects: graph, okDetail: "все импорты разрешаются, зависимости объявлены" }),
    toCheck({ key: "boundary", label: "Клиент/сервер", defects: boundary, okDetail: "директивы соответствуют содержимому" }),
    toCheck({ key: "static", label: "Статический экспорт", defects: staticExport, okDetail: "нет серверных конструкций" }),
    toCheck({ key: "routes", label: "Маршруты", defects: routes, okDetail: "каждая страница отдаёт компонент" }),
    toCheck({ key: "hygiene", label: "Чистота исходников", defects: hygiene, okDetail: "нет заглушек и следов ответа модели" }),
    toCheck({ key: "props", label: "Пропы компонентов", defects: props, okDetail: "переданные пропы совпадают с сигнатурами" }),
  ]

  const defects = [...syntax, ...graph, ...boundary, ...staticExport, ...routes, ...hygiene, ...props].sort((a, b) =>
    a.severity === b.severity ? a.file.localeCompare(b.file) : a.severity === "error" ? -1 : 1,
  )

  return {
    ok: defects.every((d) => d.severity !== "error"),
    analyzed: true,
    checks,
    defects,
    analyzedFiles: codeFiles.length,
  }
}

/* ----------------------------------------------------------------
   Механический ремонт
   ---------------------------------------------------------------- */

export type RepairAction = {
  rule: string
  file: string
  /** Человеческое описание того, что реально сделано с кодом. */
  action: string
}

export type RepairOutcome = {
  files: SourceFile[]
  actions: RepairAction[]
}

/** Срезает markdown-обвязку и пояснения модели до первой строки кода. */
function stripMarkdown(content: string): string {
  const lines = content.split(/\r?\n/)
  const out: string[] = []
  let started = false
  for (const line of lines) {
    if (/^\s*```/.test(line)) continue // сама метка фенса — всегда мусор в .tsx
    if (!started) {
      // Пояснительная проза до первой строки кода («Вот полный файл:»).
      if (!/^\s*("use |'use |import |export |const |let |function |class |type |interface |\/\/|\/\*|@)/.test(line)) {
        if (line.trim() === "") continue
        continue
      }
      started = true
    }
    out.push(line)
  }
  const result = out.join("\n").trim()
  return result.length > 0 ? `${result}\n` : content
}

/** Вставляет директиву "use client" перед первой строкой кода. */
function prependUseClient(content: string): string {
  return `"use client"\n\n${content.replace(/^﻿/, "").trimStart()}`
}

/** Дописывает default-экспорт существующему символу. */
function appendDefaultExport(content: string, symbol: string): string {
  const trimmed = content.replace(/\s+$/, "")
  return `${trimmed}\n\nexport default ${symbol}\n`
}

/** Переписывает `import { X } from "m"` в `import X from "m"`. */
function namedImportToDefault(content: string, spec: string, symbol: string, alias: string): string {
  const escaped = spec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(
    `import\\s*\\{\\s*${symbol}(\\s+as\\s+\\w+)?\\s*,?\\s*\\}\\s*from\\s*(["'])${escaped}\\2`,
    "m",
  )
  return content.replace(re, `import ${alias} from "${spec}"`)
}

/** Удаляет `export const dynamic = ...` (и родню), несовместимые со static export. */
function removeDynamicFlag(content: string, symbol: string): string {
  const re = new RegExp(`^\\s*export\\s+const\\s+${symbol}\\s*=.*$\\n?`, "m")
  return content.replace(re, "")
}

/**
 * Механический ремонт дефектов, помеченных autoFixable. Правки узкие и
 * консервативные: директива, недостающий экспорт, форма импорта, снятие
 * несовместимой конструкции, срез markdown-обвязки. Ни одна из них не
 * «дописывает продукт за AI» — они лишь восстанавливают контракт сборки.
 *
 * Никогда не бросает. Возвращает новый набор файлов и журнал того, что
 * реально сделано (журнал уезжает в отчёт проекта — пользователь видит,
 * что платформа починила).
 */
export function repairIntegrity(files: SourceFile[], report: IntegrityReport): RepairOutcome {
  const byPath = new Map<string, string>(files.map((f) => [normalizePath(f.path), f.content]))
  const removed = new Set<string>()
  const actions: RepairAction[] = []

  const fixable = report.defects.filter((d) => d.autoFixable)
  // Порядок важен: сначала чистим содержимое, потом правим структуру.
  const order = [
    "markdown-leak",
    "api-route-unsupported",
    "dynamic-flag-unsupported",
    "use-client-missing",
    "route-default-export-missing",
    "default-export-missing",
    "named-import-missing",
    // Пропы правим последними: правка точечная и от структуры файла не зависит.
    "prop-type-mismatch",
  ]
  fixable.sort((a, b) => order.indexOf(a.rule) - order.indexOf(b.rule))

  for (const defect of fixable) {
    const path = normalizePath(defect.file)
    if (removed.has(path)) continue
    const content = byPath.get(path)
    if (content === undefined && defect.rule !== "api-route-unsupported") continue

    try {
      switch (defect.rule) {
        case "markdown-leak": {
          const next = stripMarkdown(content!)
          if (next !== content) {
            byPath.set(path, next)
            actions.push({ rule: defect.rule, file: path, action: "срезана markdown-обвязка ответа модели" })
          }
          break
        }
        case "api-route-unsupported": {
          byPath.delete(path)
          removed.add(path)
          actions.push({ rule: defect.rule, file: path, action: "удалён серверный роут, несовместимый со статическим экспортом" })
          break
        }
        case "dynamic-flag-unsupported": {
          const symbol = defect.hint?.symbol
          if (!symbol) break
          const next = removeDynamicFlag(content!, symbol)
          if (next !== content) {
            byPath.set(path, next)
            actions.push({ rule: defect.rule, file: path, action: `снят export const ${symbol}` })
          }
          break
        }
        case "use-client-missing": {
          byPath.set(path, prependUseClient(content!))
          actions.push({ rule: defect.rule, file: path, action: 'добавлена директива "use client"' })
          break
        }
        case "route-default-export-missing":
        case "default-export-missing": {
          const symbol = defect.hint?.symbol
          if (!symbol) break
          byPath.set(path, appendDefaultExport(content!, symbol))
          actions.push({ rule: defect.rule, file: path, action: `дописан export default ${symbol}` })
          break
        }
        case "named-import-missing": {
          const { spec, symbol, alias } = defect.hint ?? {}
          if (!spec || !symbol) break
          const next = namedImportToDefault(content!, spec, symbol, alias || symbol)
          if (next !== content) {
            byPath.set(path, next)
            actions.push({ rule: defect.rule, file: path, action: `импорт "${symbol}" переведён в default-форму` })
          }
          break
        }
        case "prop-type-mismatch": {
          const { tag, prop, mode, referenced } = defect.hint ?? {}
          if (!tag || !prop || !mode || !referenced) break
          const next = repairPropValue(content!, { tag, prop, mode, referenced })
          if (next !== content) {
            byPath.set(path, next)
            actions.push({
              rule: defect.rule,
              file: path,
              action:
                mode === "unwrap"
                  ? `<${tag}>: проп "${prop}" получает ${referenced} вместо <${referenced} /> (ждали сам компонент)`
                  : `<${tag}>: проп "${prop}" получает <${referenced} /> вместо ${referenced} (ждали разметку)`,
            })
          }
          break
        }
        default:
          break
      }
    } catch (err) {
      captureError(`[build-integrity] механический ремонт ${defect.rule} в ${path} не удался:`, err)
    }
  }

  const repaired: SourceFile[] = files
    .filter((f) => !removed.has(normalizePath(f.path)))
    .map((f) => ({ path: f.path, content: byPath.get(normalizePath(f.path)) ?? f.content }))

  return { files: repaired, actions }
}

/** Компактная сводка дефектов для промпта AI-ремонта (по файлу, с ограничением объёма). */
export function formatDefectsForRepair(defects: IntegrityDefect[], maxDefects = 12): string {
  const top = defects.filter((d) => d.severity === "error").slice(0, maxDefects)
  if (top.length === 0) return ""

  const byFile = new Map<string, IntegrityDefect[]>()
  for (const defect of top) {
    const list = byFile.get(defect.file) ?? []
    list.push(defect)
    byFile.set(defect.file, list)
  }

  return [...byFile.entries()]
    .map(
      ([file, list]) =>
        `${file}:\n${list.map((d) => `  - [${d.rule}]${d.line ? ` строка ${d.line}:` : ""} ${d.message}`).join("\n")}`,
    )
    .join("\n")
}

/** Файлы, которые имеет смысл перегенерировать AI (только грубые дефекты). */
export function filesNeedingRegeneration(defects: IntegrityDefect[]): string[] {
  const files = defects.filter((d) => d.severity === "error").map((d) => d.file)
  return [...new Set(files)].filter((f) => isCodeFile(f))
}

/** Имя компонента по пути файла — подсказка модели при перегенерации. */
export function componentNameFor(path: string): string {
  const base = basenameNoExt(path)
  if (base === "page" || base === "index") {
    const dir = basenameNoExt(dirname(path)) || "Page"
    return dir.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase())
  }
  return base.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase())
}
