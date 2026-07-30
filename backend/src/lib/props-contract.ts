import type { IntegrityDefect, SourceFile } from "./build-integrity"

/* ================================================================
   OSGARD · Контракт ТИПОВ ПРОПОВ между параллельными файлами
   ----------------------------------------------------------------
   ЗАЧЕМ. Волна 1 согласовала между файлами ФОРМУ импорта (default против
   именованного) — но не то, ЧТО именно принимает импортированный
   компонент. Файлы по-прежнему пишутся параллельно и не видят сигнатур
   друг друга, поэтому появился следующий класс расхождения:

       components/EmptyState.tsx   →  { icon?: LucideIcon, title: string }
       components/NotesEmpty.tsx   →  <EmptyState icon={<FileText />} />
                                                        ^^^^^^^^^^^^
   компонент ждёт САМ компонент (ссылку), а сосед передаёт уже
   отрисованный элемент. Это валит `next build` на prerender.

   ПОЧЕМУ ЭТО НЕ ЛОВИЛОСЬ. Каркас приложения ставит
   `typescript: { ignoreBuildErrors: true }` в next.config.js — иначе
   почти любая мелочь в коде от модели ронял бы сборку целиком, и
   пользователь не получал бы вообще ничего. Значит обычный tsc
   заглушён НАМЕРЕННО, и полагаться на него нельзя: расхождение
   пропов обязана ловить сама платформа, внутрипроцессно (в проде
   Docker'а нет — см. sandbox.service, там всегда `skipped`).

   ПОЧЕМУ БЕЗ TYPE-CHECKER'А. Полная проверка типов требует
   node_modules сгенерированного приложения (react, next, lucide-react)
   — в проде их нет и быть не может. Поэтому здесь СТРУКТУРНАЯ сверка
   по AST: объявленные пропы против фактически переданных атрибутов.
   Отсюда главный принцип модуля — КОНСЕРВАТИВНОСТЬ: сомнительное
   молчит. Ложное срабатывание тут дороже пропущенного дефекта, потому
   что оно отправляет исправный файл в AI-ремонт (жжёт бюджет раунда,
   см. project-engineering) и может ухудшить рабочий код.

   Отсюда все ограничения ниже:
   - судим только о компонентах, чьё объявление НАЙДЕНО однозначно
     (ровно один файл набора объявляет это имя);
   - только если потребитель импортирует его ЛОКАЛЬНЫМ спецификатором
     (иначе `<FileText />` из lucide-react сверялся бы с чужой
     сигнатурой);
   - `{...spread}` в элементе полностью выключает суждение об этом
     элементе: что там внутри — неизвестно;
   - о «лишнем» пропе судим только у ЗАКРЫТОГО объявления (инлайн
     literal или локальный type/interface без extends/&/index-signature);
   - несовпадение типа — только на заведомо несовместимых парах
     (компонент против элемента, строка против числа и т.п.), а не на
     любом различии.

   Модуль ничего не знает про AI и БД: на вход файлы, на выходе дефекты
   в общем формате `IntegrityDefect` и детерминированный ремонт двух
   зеркальных случаев. Проверяется юнит-тестами без ключей.
   ================================================================ */

/** Грубая категория типа — ровно та, о которой можно судить без type-checker'а. */
export type PropKind =
  | "component"
  | "node"
  | "function"
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  /** Судить нельзя — молчим. */
  | "unknown"

/** Категория переданного значения. `component-ref` — ссылка на компонент без JSX. */
export type ValueKind = PropKind | "jsx-element" | "component-ref"

type PropDecl = {
  name: string
  /** Проп можно не передавать: `?`, `| undefined` или default в деструктуризации. */
  optional: boolean
  kind: PropKind
  /** Текст типа как написан — идёт в сообщение дефекта, чтобы оно было проверяемым. */
  raw: string
}

type ComponentDecl = {
  name: string
  path: string
  props: Map<string, PropDecl>
  /** Набор пропов исчерпывающий — можно судить о лишнем атрибуте. */
  closed: boolean
  /** В деструктуризации есть `...rest` — о лишнем не судим. */
  hasRest: boolean
}

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

type Ts = typeof import("typescript")
type SF = import("typescript").SourceFile

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "")
}

/** Парс одного файла. Рекурсивный парсер TS падает RangeError на патологическом
 *  входе от сорвавшейся модели — роняем ОДИН файл, а не весь разбор. */
function parse(ts: Ts, file: SourceFile): SF | null {
  try {
    return ts.createSourceFile(
      file.path,
      file.content,
      ts.ScriptTarget.Latest,
      true,
      file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    )
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------
   Классификация типов
   ---------------------------------------------------------------- */

/** Имена типов, означающие «сам компонент, а не отрисованный элемент». */
const COMPONENT_TYPE_NAMES = new Set([
  "LucideIcon",
  "ComponentType",
  "ElementType",
  "FC",
  "FunctionComponent",
  "ForwardRefExoticComponent",
])
/** Имена типов, означающие «готовая разметка». */
const NODE_TYPE_NAMES = new Set(["ReactNode", "ReactElement", "Element", "ReactChild", "ReactFragment"])

function typeNameOf(ts: Ts, node: import("typescript").TypeNode): string | null {
  if (!ts.isTypeReferenceNode(node)) return null
  const n = node.typeName
  if (ts.isIdentifier(n)) return n.text
  // React.ReactNode / JSX.Element — берём последний сегмент.
  if (ts.isQualifiedName(n)) return n.right.text
  return null
}

function classifyType(ts: Ts, node: import("typescript").TypeNode | undefined): PropKind {
  if (!node) return "unknown"

  if (ts.isUnionTypeNode(node)) {
    /* Юнион: отбрасываем undefined/null (они говорят лишь о необязательности) и
       судим по остатку. Остаток разнородный — молчим. */
    const meaningful = node.types.filter(
      (t) => t.kind !== ts.SyntaxKind.UndefinedKeyword && t.kind !== ts.SyntaxKind.NullKeyword,
    )
    const kinds = new Set(meaningful.map((t) => classifyType(ts, t)))
    if (kinds.size === 1) return [...kinds][0]
    // Юнион строковых литералов (`"sm" | "lg"`) — это строка.
    if (meaningful.length > 0 && meaningful.every((t) => ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal))) {
      return "string"
    }
    return "unknown"
  }

  if (ts.isParenthesizedTypeNode(node)) return classifyType(ts, node.type)
  if (ts.isFunctionTypeNode(node)) return "function"
  if (ts.isArrayTypeNode(node)) return "array"
  if (ts.isTypeLiteralNode(node)) return "object"

  switch (node.kind) {
    case ts.SyntaxKind.StringKeyword:
      return "string"
    case ts.SyntaxKind.NumberKeyword:
      return "number"
    case ts.SyntaxKind.BooleanKeyword:
      return "boolean"
    default:
      break
  }

  if (ts.isLiteralTypeNode(node)) {
    if (ts.isStringLiteral(node.literal)) return "string"
    if (ts.isNumericLiteral(node.literal)) return "number"
    if (node.literal.kind === ts.SyntaxKind.TrueKeyword || node.literal.kind === ts.SyntaxKind.FalseKeyword) {
      return "boolean"
    }
    return "unknown"
  }

  const name = typeNameOf(ts, node)
  if (!name) return "unknown"
  if (COMPONENT_TYPE_NAMES.has(name)) return "component"
  if (NODE_TYPE_NAMES.has(name)) return "node"
  if (name === "Array" || name === "ReadonlyArray") return "array"
  if (/EventHandler$/.test(name) || name === "VoidFunction") return "function"
  return "unknown"
}

/** Содержит ли юнион `undefined` — тогда проп фактически необязателен. */
function unionHasUndefined(ts: Ts, node: import("typescript").TypeNode | undefined): boolean {
  if (!node || !ts.isUnionTypeNode(node)) return false
  return node.types.some((t) => t.kind === ts.SyntaxKind.UndefinedKeyword)
}

/* ----------------------------------------------------------------
   Сбор объявлений компонентов
   ---------------------------------------------------------------- */

/** Пропы из TypeLiteral/interface/type-alias. `null` — судить нельзя (открытый тип). */
function propsFromMembers(
  ts: Ts,
  members: readonly import("typescript").TypeElement[],
  sf: SF,
): { props: Map<string, PropDecl>; closed: boolean } {
  const props = new Map<string, PropDecl>()
  let closed = true

  for (const member of members) {
    if (ts.isIndexSignatureDeclaration(member)) {
      closed = false // `[key: string]: unknown` — любой проп законен
      continue
    }
    if (!ts.isPropertySignature(member) || !member.name) continue
    if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue
    const name = ts.isIdentifier(member.name) ? member.name.text : member.name.text
    props.set(name, {
      name,
      optional: !!member.questionToken || unionHasUndefined(ts, member.type),
      kind: classifyType(ts, member.type),
      raw: member.type ? member.type.getText(sf) : "unknown",
    })
  }

  return { props, closed }
}

/** Раскрывает тип пропов параметра компонента. */
function resolvePropsType(
  ts: Ts,
  sf: SF,
  typeNode: import("typescript").TypeNode | undefined,
): { props: Map<string, PropDecl>; closed: boolean } | null {
  if (!typeNode) return null

  if (ts.isTypeLiteralNode(typeNode)) {
    return propsFromMembers(ts, typeNode.members, sf)
  }

  const name = typeNameOf(ts, typeNode)
  if (!name) return null

  /* Локальные type/interface раскрываем. Ссылку на внешний тип (`ButtonProps`
     из чужого файла, `React.PropsWithChildren<...>`) НЕ раскрываем: он может
     тянуть за собой любые пропы — судить о таком компоненте небезопасно. */
  for (const stmt of sf.statements) {
    if (ts.isInterfaceDeclaration(stmt) && stmt.name.text === name) {
      // extends — набор шире объявленного, о лишнем судить нельзя.
      const inherits = (stmt.heritageClauses?.length ?? 0) > 0
      const collected = propsFromMembers(ts, stmt.members, sf)
      return { props: collected.props, closed: collected.closed && !inherits }
    }
    if (ts.isTypeAliasDeclaration(stmt) && stmt.name.text === name) {
      if (ts.isTypeLiteralNode(stmt.type)) return propsFromMembers(ts, stmt.type.members, sf)
      if (ts.isIntersectionTypeNode(stmt.type)) {
        // `A & { ... }` — собираем что можем, но набор считаем открытым.
        const props = new Map<string, PropDecl>()
        for (const part of stmt.type.types) {
          if (!ts.isTypeLiteralNode(part)) continue
          for (const [k, v] of propsFromMembers(ts, part.members, sf).props) props.set(k, v)
        }
        return { props, closed: false }
      }
      return null
    }
  }

  return null
}

/** Возвращает объявление компонента, если стейтмент им является. */
function componentFromStatement(
  ts: Ts,
  sf: SF,
  path: string,
  stmt: import("typescript").Statement,
): ComponentDecl | null {
  let name: string | null = null
  let param: import("typescript").ParameterDeclaration | undefined

  if (ts.isFunctionDeclaration(stmt) && stmt.name) {
    name = stmt.name.text
    param = stmt.parameters[0]
  } else if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0]
    if (!decl || !ts.isIdentifier(decl.name) || !decl.initializer) return null
    if (!ts.isArrowFunction(decl.initializer) && !ts.isFunctionExpression(decl.initializer)) return null
    name = decl.name.text
    param = decl.initializer.parameters[0]
  }

  // Компонент — с заглавной буквы (то же соглашение, что у контракта экспортов).
  if (!name || !/^[A-Z]/.test(name)) return null
  if (!param) {
    // Компонент без пропов: судить можно только о лишнем атрибуте.
    return { name, path, props: new Map(), closed: true, hasRest: false }
  }

  const resolved = resolvePropsType(ts, sf, param.type)
  if (!resolved) return null

  const props = new Map(resolved.props)
  let hasRest = false

  /* Деструктуризация уточняет ДВЕ вещи: `...rest` (набор открыт) и значения по
     умолчанию (`{ size = "md" }` — проп фактически необязателен, даже если в
     типе он объявлен обязательным). */
  if (ts.isObjectBindingPattern(param.name)) {
    for (const element of param.name.elements) {
      if (element.dotDotDotToken) {
        hasRest = true
        continue
      }
      if (!element.initializer) continue
      const key = element.propertyName ?? element.name
      if (!ts.isIdentifier(key)) continue
      const existing = props.get(key.text)
      if (existing) props.set(key.text, { ...existing, optional: true })
    }
  }

  return { name, path, props, closed: resolved.closed && !hasRest, hasRest }
}

/* ----------------------------------------------------------------
   Сбор использований
   ---------------------------------------------------------------- */

type AttrValue = {
  name: string
  kind: ValueKind
  /** Имя компонента внутри `<X />` или ссылки `{X}` — для ремонта и сообщения. */
  referenced?: string
}

type Usage = {
  tag: string
  file: string
  line: number
  attrs: AttrValue[]
  hasSpread: boolean
  selfClosing: boolean
}

/** Локально импортированные имена файла: только о них можно судить. */
function localImportedNames(ts: Ts, sf: SF): Set<string> {
  const names = new Set<string>()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    const spec = ts.isStringLiteral(stmt.moduleSpecifier) ? stmt.moduleSpecifier.text : ""
    if (!spec.startsWith(".") && !spec.startsWith("@/") && !spec.startsWith("/")) continue
    if (stmt.importClause.name) names.add(stmt.importClause.name.text)
    const bindings = stmt.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) names.add(el.name.text)
    }
  }
  return names
}

/** Имена, импортированные откуда угодно (нужно, чтобы отличить ссылку на компонент
 *  от обычной переменной: `icon={FileText}` из lucide-react — это компонент). */
function allImportedComponentNames(ts: Ts, sf: SF): Set<string> {
  const names = new Set<string>()
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue
    if (stmt.importClause.name && /^[A-Z]/.test(stmt.importClause.name.text)) names.add(stmt.importClause.name.text)
    const bindings = stmt.importClause.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const el of bindings.elements) if (/^[A-Z]/.test(el.name.text)) names.add(el.name.text)
    }
  }
  return names
}

function classifyValue(
  ts: Ts,
  attr: import("typescript").JsxAttribute,
  componentNames: Set<string>,
): AttrValue | null {
  if (!ts.isIdentifier(attr.name)) return null
  const name = attr.name.text

  // Атрибут без значения — это `true`.
  if (!attr.initializer) return { name, kind: "boolean" }

  if (ts.isStringLiteral(attr.initializer)) return { name, kind: "string" }
  if (!ts.isJsxExpression(attr.initializer)) return { name, kind: "unknown" }

  const expr = attr.initializer.expression
  if (!expr) return { name, kind: "unknown" }

  if (ts.isJsxElement(expr)) {
    const tag = expr.openingElement.tagName
    return { name, kind: "jsx-element", referenced: ts.isIdentifier(tag) ? tag.text : undefined }
  }
  if (ts.isJsxSelfClosingElement(expr)) {
    return { name, kind: "jsx-element", referenced: ts.isIdentifier(expr.tagName) ? expr.tagName.text : undefined }
  }
  if (ts.isJsxFragment(expr)) return { name, kind: "jsx-element" }

  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr) || ts.isTemplateExpression(expr)) {
    return { name, kind: "string" }
  }
  if (ts.isNumericLiteral(expr)) return { name, kind: "number" }
  if (expr.kind === ts.SyntaxKind.TrueKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) {
    return { name, kind: "boolean" }
  }
  if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return { name, kind: "function" }
  if (ts.isArrayLiteralExpression(expr)) return { name, kind: "array" }
  if (ts.isObjectLiteralExpression(expr)) return { name, kind: "object" }

  /* Голая ссылка на импортированный компонент: `icon={FileText}`. Отличать от
     обычной переменной обязательно — иначе `title={heading}` сочли бы компонентом. */
  if (ts.isIdentifier(expr) && componentNames.has(expr.text)) {
    return { name, kind: "component-ref", referenced: expr.text }
  }

  return { name, kind: "unknown" }
}

function collectUsages(ts: Ts, sf: SF, path: string): Usage[] {
  const local = localImportedNames(ts, sf)
  const componentNames = allImportedComponentNames(ts, sf)
  const usages: Usage[] = []

  const visit = (node: import("typescript").Node): void => {
    const opening = ts.isJsxSelfClosingElement(node)
      ? node
      : ts.isJsxElement(node)
        ? node.openingElement
        : null

    if (opening && ts.isIdentifier(opening.tagName) && local.has(opening.tagName.text)) {
      const attrs: AttrValue[] = []
      let hasSpread = false
      for (const prop of opening.attributes.properties) {
        if (ts.isJsxSpreadAttribute(prop)) {
          hasSpread = true
          continue
        }
        if (!ts.isJsxAttribute(prop)) continue
        const value = classifyValue(ts, prop, componentNames)
        if (value) attrs.push(value)
      }
      usages.push({
        tag: opening.tagName.text,
        file: path,
        line: sf.getLineAndCharacterOfPosition(opening.getStart(sf)).line + 1,
        attrs,
        hasSpread,
        selfClosing: ts.isJsxSelfClosingElement(node),
      })
    }

    ts.forEachChild(node, visit)
  }

  try {
    visit(sf)
  } catch {
    return usages // патологический вход — отдаём то, что успели собрать
  }
  return usages
}

/* ----------------------------------------------------------------
   Сверка
   ---------------------------------------------------------------- */

/** Заведомо несовместимые пары «ждут → передали». Только очевидное. */
const INCOMPATIBLE: Record<string, Set<ValueKind>> = {
  component: new Set<ValueKind>(["jsx-element", "string", "number", "boolean", "array"]),
  node: new Set<ValueKind>(["component-ref"]),
  string: new Set<ValueKind>(["number", "boolean", "jsx-element", "array", "object", "component-ref"]),
  number: new Set<ValueKind>(["string", "boolean", "jsx-element", "array", "object", "component-ref"]),
  boolean: new Set<ValueKind>(["string", "number", "jsx-element", "array", "object", "component-ref"]),
  function: new Set<ValueKind>(["string", "number", "boolean", "jsx-element", "array", "object", "component-ref"]),
  array: new Set<ValueKind>(["string", "number", "boolean", "jsx-element", "component-ref"]),
  object: new Set<ValueKind>(["string", "number", "boolean", "jsx-element", "component-ref"]),
}

const KIND_RU: Record<ValueKind, string> = {
  component: "сам компонент (ссылку, без JSX)",
  node: "готовую разметку",
  function: "функцию",
  string: "строку",
  number: "число",
  boolean: "boolean",
  array: "массив",
  object: "объект",
  unknown: "значение",
  "jsx-element": "отрисованный JSX-элемент",
  "component-ref": "ссылку на компонент без JSX",
}

/** React-служебные атрибуты: частью пропов компонента не являются. */
const RESERVED_ATTRS = new Set(["key", "ref"])

/**
 * Сверяет фактически переданные пропы с объявленными сигнатурами соседей.
 * Возвращает дефекты в общем формате инженерного контура.
 *
 * Компонент сверяется, только если его объявление НАЙДЕНО РОВНО В ОДНОМ файле
 * набора: одноимённые компоненты в двух файлах делают вывод неоднозначным, а
 * ошибаться здесь дороже, чем промолчать.
 */
export function propsContractDefects(files: SourceFile[]): IntegrityDefect[] {
  const ts = loadTs()
  if (!ts) return []

  const code = files.filter((f) => /\.tsx?$/.test(f.path) && !/\.d\.ts$/.test(f.path))
  const parsed = new Map<string, SF>()
  for (const file of code) {
    const sf = parse(ts, { path: normalize(file.path), content: file.content })
    if (sf) parsed.set(normalize(file.path), sf)
  }

  /* Индекс объявлений по ИМЕНИ. Дубли имён вычёркиваем целиком. */
  const byName = new Map<string, ComponentDecl | "ambiguous">()
  for (const [path, sf] of parsed) {
    for (const stmt of sf.statements) {
      let decl: ComponentDecl | null = null
      try {
        decl = componentFromStatement(ts, sf, path, stmt)
      } catch {
        decl = null
      }
      if (!decl) continue
      byName.set(decl.name, byName.has(decl.name) ? "ambiguous" : decl)
    }
  }

  const defects: IntegrityDefect[] = []

  for (const [path, sf] of parsed) {
    for (const usage of collectUsages(ts, sf, path)) {
      const decl = byName.get(usage.tag)
      if (!decl || decl === "ambiguous") continue
      if (decl.path === path) continue // свой же компонент — сигнатуру автор видит
      if (usage.hasSpread) continue // `{...props}` — состав неизвестен

      const passed = new Map(usage.attrs.map((a) => [a.name, a]))

      /* 1. Обязательный проп не передан. */
      for (const prop of decl.props.values()) {
        if (prop.optional || passed.has(prop.name)) continue
        /* children приходит содержимым элемента, а не атрибутом — судить можно
           только о самозакрывающемся элементе: у него детей нет заведомо. */
        if (prop.name === "children" && !usage.selfClosing) continue
        defects.push({
          rule: "prop-required-missing",
          severity: "error",
          file: path,
          line: usage.line,
          message: `<${usage.tag}> не получает обязательный проп "${prop.name}" (${prop.raw}), объявленный в ${decl.path} — сборка упадёт на проверке типов`,
          autoFixable: false,
        })
      }

      /* 2. Проп, которого в сигнатуре нет. */
      if (decl.closed) {
        for (const attr of usage.attrs) {
          if (RESERVED_ATTRS.has(attr.name)) continue
          if (decl.props.has(attr.name)) continue
          defects.push({
            rule: "prop-unknown",
            severity: "error",
            file: path,
            line: usage.line,
            message: `<${usage.tag}> получает проп "${attr.name}", которого нет в сигнатуре компонента (${decl.path}) — либо опечатка в имени, либо проп забыли объявить`,
            autoFixable: false,
          })
        }
      }

      /* 3. Несовместимая категория значения. */
      for (const attr of usage.attrs) {
        const prop = decl.props.get(attr.name)
        if (!prop || prop.kind === "unknown" || attr.kind === "unknown") continue
        if (!INCOMPATIBLE[prop.kind]?.has(attr.kind)) continue

        /* Два зеркальных случая чинятся детерминированно — ровно тот дефект,
           из-за которого волна 3 и появилась. */
        const unwrap = prop.kind === "component" && attr.kind === "jsx-element" && !!attr.referenced
        const wrap = prop.kind === "node" && attr.kind === "component-ref" && !!attr.referenced

        defects.push({
          rule: "prop-type-mismatch",
          severity: "error",
          file: path,
          line: usage.line,
          message:
            `<${usage.tag}> передаёт в проп "${attr.name}" ${KIND_RU[attr.kind]}, ` +
            `а компонент ждёт ${KIND_RU[prop.kind]} (${prop.raw}, объявлено в ${decl.path})` +
            (unwrap
              ? ` — нужно ${attr.name}={${attr.referenced}} без JSX`
              : wrap
                ? ` — нужно ${attr.name}={<${attr.referenced} />}`
                : ""),
          autoFixable: unwrap || wrap,
          hint: {
            tag: usage.tag,
            prop: attr.name,
            mode: unwrap ? "unwrap" : wrap ? "wrap" : "none",
            ...(attr.referenced ? { referenced: attr.referenced } : {}),
          },
        })
      }
    }
  }

  return defects
}

/* ----------------------------------------------------------------
   Детерминированный ремонт
   ---------------------------------------------------------------- */

/**
 * Чинит ОДИН атрибут в содержимом файла: снимает лишний JSX (`icon={<X />}` →
 * `icon={X}`) или, наоборот, оборачивает ссылку (`icon={X}` → `icon={<X />}`).
 *
 * Позиции ищутся ЗАНОВО по актуальному содержимому — поэтому функция безопасна в
 * любом порядке относительно других ремонтов (важно: repairIntegrity правит те же
 * файлы, и позиции, собранные на этапе разбора, к моменту ремонта уже могли
 * сдвинуться). Идемпотентна: повторный вызов ничего не меняет.
 */
export function repairPropValue(
  content: string,
  hint: { tag: string; prop: string; mode: string; referenced?: string },
): string {
  const ts = loadTs()
  if (!ts || !hint.referenced || (hint.mode !== "unwrap" && hint.mode !== "wrap")) return content

  const sf = parse(ts, { path: hint.mode === "unwrap" ? "fix.tsx" : "fix.tsx", content })
  if (!sf) return content

  /* Правку собираем как ОДНУ замену по индексам: строковый replace по тексту
     атрибута задел бы одноимённые пропы других элементов файла. */
  let edit: { start: number; end: number; text: string } | null = null

  const visit = (node: import("typescript").Node): void => {
    if (edit) return
    const opening = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxElement(node) ? node.openingElement : null
    if (opening && ts.isIdentifier(opening.tagName) && opening.tagName.text === hint.tag) {
      for (const prop of opening.attributes.properties) {
        if (!ts.isJsxAttribute(prop) || !ts.isIdentifier(prop.name) || prop.name.text !== hint.prop) continue
        if (!prop.initializer || !ts.isJsxExpression(prop.initializer)) continue
        const expr = prop.initializer.expression
        if (!expr) continue

        if (hint.mode === "unwrap") {
          const isElement = ts.isJsxSelfClosingElement(expr) || ts.isJsxElement(expr)
          if (!isElement) continue
          const tag = ts.isJsxSelfClosingElement(expr) ? expr.tagName : expr.openingElement.tagName
          if (!ts.isIdentifier(tag) || tag.text !== hint.referenced) continue
          edit = { start: expr.getStart(sf), end: expr.getEnd(), text: hint.referenced }
          return
        }

        // wrap
        if (!ts.isIdentifier(expr) || expr.text !== hint.referenced) continue
        edit = { start: expr.getStart(sf), end: expr.getEnd(), text: `<${hint.referenced} />` }
        return
      }
    }
    ts.forEachChild(node, visit)
  }

  try {
    visit(sf)
  } catch {
    return content
  }

  if (!edit) return content
  const { start, end, text } = edit
  return content.slice(0, start) + text + content.slice(end)
}
