import { createHash } from "node:crypto"
import { callClaudeRaw, callDeepSeekRaw, callGrokRaw, extractJson, isAiConfigured } from "./ai-router"
import { captureError } from "../lib/sentry"
import { durableCache } from "./agents/durable-cache"
import {
  ARCHETYPE_MENU,
  DESIGN_BRIEF_VERSION,
  EFFECT_MENU,
  FONT_MENU,
  clampBriefProposal,
  deriveDesignBrief,
  renderDesignContract,
  renderDesignSystemFiles,
  renderFallbackPage,
  type BriefProposal,
  type DesignBrief,
} from "../lib/design-system"

/* Кеш результата генерации по (name, hint): одинаковый промпт → готовый набор
   файлов без повторной дорогой цепочки AI-вызовов. durableCache (SQLite) переживает
   рестарт — повторная/похожая генерация не начинается с нуля (требование владельца).
   Кешируем ТОЛЬКО успешные ai-результаты, не fallback. TTL 24ч.

   В ключ входит версия дизайн-системы: после её изменения кеш обязан промахнуться,
   иначе проекты продолжили бы получать облик прошлого поколения. */
const APP_CACHE_TTL_SECONDS = 24 * 60 * 60
function appCacheKey(name: string, hint?: string): string {
  return `app-generator:v${DESIGN_BRIEF_VERSION}:${createHash("sha256").update(JSON.stringify({ name, hint: hint ?? "" })).digest("hex")}`
}

/* ================================================================
   OSGARD · App Generator Service
   ----------------------------------------------------------------
   Генерирует РЕАЛЬНОЕ Next.js-приложение (не флейвор-текст): базовый
   статический шаблон (package.json, next.config.js с output:'export',
   tailwind, layout) + набор страниц/компонентов, сгенерированных AI
   по двухшаговой схеме (манифест файлов → содержимое каждого файла).
   Провайдеры пробуются по цепочке Claude → DeepSeek → Grok (как в
   ai-generator.ts); если ни один не сконфигурирован или все упали —
   минимальный статический fallback-проект, генерация никогда не падает.
   ================================================================ */

export type GeneratedAppFile = {
  path: string
  content: string
}

export type AppGenerationResult = {
  files: GeneratedAppFile[]
  source: "ai" | "fallback"
  /** Дизайн-система, по которой собрано приложение. Сохраняется вместе с проектом. */
  brief: DesignBrief
}

export type ManifestEntry = {
  path: string
  purpose: string
}

const RAW_PROVIDER_CHAIN: Array<(prompt: string, maxTokens: number) => Promise<string | null>> = [
  callClaudeRaw,
  callDeepSeekRaw,
  callGrokRaw,
]

export async function callAnyProvider(prompt: string, maxTokens: number): Promise<string | null> {
  for (const provider of RAW_PROVIDER_CHAIN) {
    const result = await provider(prompt, maxTokens)
    if (result) return result
  }
  return null
}

/** Достаёт код из ```-фенса ответа модели (в отличие от extractJson — без JSON.parse,
 *  т.к. исходный код содержит кавычки/шаблонные строки, ломающие JSON-экранирование). */
export function extractCodeBlock(text: string): string | null {
  const fenced = text.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : text).trim()
  return candidate.length > 0 ? candidate : null
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "osgard-app"
}

/** Базовый каркас Next.js-приложения — не генерируется AI, всегда стабилен.
 *  Три файла дизайн-системы (tailwind.config.ts, globals.css, layout.tsx) приходят
 *  из брифа: раньше здесь лежали пустой `theme: { extend: {} }` и голый layout,
 *  из-за чего у приложения не было дизайн-системы вообще. */
function staticTemplateFiles(name: string, brief: DesignBrief, description: string): GeneratedAppFile[] {
  const slug = slugify(name)

  return [
    ...renderDesignSystemFiles(brief, name, description),
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name: slug,
          version: "0.1.0",
          private: true,
          scripts: {
            dev: "next dev",
            build: "next build",
            start: "next start",
          },
          dependencies: {
            next: "^14.2.0",
            react: "^18.3.0",
            "react-dom": "^18.3.0",
          },
          devDependencies: {
            typescript: "^5.7.0",
            tailwindcss: "^3.4.0",
            postcss: "^8.4.0",
            autoprefixer: "^10.4.0",
            "@types/node": "^22.0.0",
            "@types/react": "^18.3.0",
            "@types/react-dom": "^18.3.0",
          },
        },
        null,
        2,
      ),
    },
    {
      path: "next.config.js",
      content: `/** @type {import('next').NextConfig} */\nconst nextConfig = {\n  output: "export",\n  images: { unoptimized: true },\n  typescript: { ignoreBuildErrors: true },\n  eslint: { ignoreDuringBuilds: true },\n}\n\nmodule.exports = nextConfig\n`,
    },
    {
      path: "tsconfig.json",
      content: JSON.stringify(
        {
          compilerOptions: {
            target: "es2017",
            lib: ["dom", "dom.iterable", "esnext"],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: "esnext",
            moduleResolution: "bundler",
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: "preserve",
            incremental: true,
            paths: { "@/*": ["./*"] },
          },
          include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
          exclude: ["node_modules"],
        },
        null,
        2,
      ),
    },
    {
      path: "postcss.config.js",
      content: `module.exports = {\n  plugins: { tailwindcss: {}, autoprefixer: {} },\n}\n`,
    },
    {
      path: "README.md",
      content: `# ${name}\n\nПриложение сгенерировано в OSGARD. Это реальный Next.js-проект: можно запускать\nлокально (\`npm install && npm run dev\`), редактировать и публиковать на GitHub.\n\n## Дизайн-система\n\nАрхетип «${brief.archetype}» · ${brief.mood}\n\nЦвета, типографика, отступы и тени объявлены токенами в \`tailwind.config.ts\`\nи \`app/globals.css\`. Контраст основного текста к фону — ${brief.contrast.inkOnCanvas}:1\n(WCAG AA требует 4.5:1). Используй токены (\`bg-canvas\`, \`bg-surface\`, \`text-ink\`,\n\`bg-primary\`), а не сырые цвета — тогда интерфейс останется цельным.\n`,
    },
  ]
}

/** Бриф по умолчанию — нужен только для вычисления списка занятых путей. */
const DEFAULT_BRIEF = deriveDesignBrief({ name: "osgard", theme: "general" })

const RESERVED_PATHS = new Set(
  staticTemplateFiles("x", DEFAULT_BRIEF, "").map((f) => f.path.toLowerCase()),
)

/* ----------------------------------------------------------------
   AI-арт-директор
   ---------------------------------------------------------------- */

function buildArtDirectionPrompt(name: string, hint: string | undefined, base: DesignBrief): string {
  return `Ты — арт-директор с опытом продуктового дизайна мирового уровня.
Тебе нужно задать визуальный характер приложения "${name}"${hint ? ` (тема: "${hint}")` : ""}.

Базовое предложение системы: архетип "${base.archetype}", схема "${base.scheme}",
настроение "${base.mood}". Ты можешь согласиться или предложить лучше.

Верни СТРОГО валидный JSON без markdown и пояснений:
{
  "archetype": один из ${JSON.stringify(ARCHETYPE_MENU)},
  "scheme": "light" | "dark",
  "hue": число 0..359 — основной оттенок бренда,
  "accentHue": число 0..359 — оттенок дополнительного акцента,
  "saturation": число 0..1 — насыщенность акцента,
  "density": "compact" | "comfortable" | "spacious",
  "radiusStyle": "sharp" | "default" | "soft" | "pill",
  "displayFont": один из ${JSON.stringify(FONT_MENU.display)},
  "bodyFont": один из ${JSON.stringify(FONT_MENU.body)},
  "effect": один из ${JSON.stringify(EFFECT_MENU)} — материал поверхностей: glass (стекло, полупрозрачность и блюр), neon (яркая обводка и свечение), matte (плоские поверхности без блюра), aurora (анимированная градиентная рамка), crystal (сильный блюр и зерно поверх контента),
  "mood": "короткая фраза о настроении интерфейса, до 100 символов",
  "voice": "как звучат тексты интерфейса, до 140 символов",
  "layout": ["3-5 конкретных правил раскладки для этого приложения"]
}

Думай о пользователе: какой эмоциональный тон уместен, что человек должен
почувствовать за первые три секунды, какое действие должно быть очевидно главным.
Не описывай цвета словами и не присылай HEX — только числовые оттенки.
Ответь только JSON.`
}

/**
 * Один AI-вызов, задающий визуальный характер. Ответ модели НЕ применяется как есть:
 * `clampBriefProposal` зажимает его в безопасное пространство архетипа, а контраст
 * пересчитывается алгоритмом. Провайдер молчит, ответил мусором или упал —
 * возвращается детерминированный бриф. Генерация не деградирует никогда.
 */
async function directDesign(name: string, hint: string | undefined, base: DesignBrief): Promise<DesignBrief> {
  try {
    const text = await callAnyProvider(buildArtDirectionPrompt(name, hint, base), 900)
    if (!text) return base
    const parsed = extractJson(text) as BriefProposal | null
    return clampBriefProposal(base, parsed)
  } catch (err) {
    captureError("[app-generator] art direction failed, using deterministic brief:", err)
    return base
  }
}

function buildManifestPrompt(name: string, hint: string | undefined, brief: DesignBrief): string {
  return `Ты — генератор реальных React/Next.js (App Router) приложений для платформы OSGARD.
Пользователь хочет приложение с названием "${name}"${hint ? ` в направлении/теме: "${hint}"` : ""}.

Визуальный характер приложения уже задан: архетип "${brief.archetype}", настроение
"${brief.mood}", плотность "${brief.density}". Раскладка, которой держится продукт:
${brief.layout.map((l) => `- ${l}`).join("\n")}

Спроектируй список файлов приложения (страницы в app/, компоненты в components/).
Базовые файлы (package.json, next.config.js, app/layout.tsx, tailwind и т.д.) уже есть — их не включай.

Верни СТРОГО валидный JSON (без markdown, без пояснений) вида:
{
  "files": [
    { "path": "app/page.tsx", "purpose": "главная страница — краткое описание содержимого" },
    { "path": "components/Hero.tsx", "purpose": "..." }
  ]
}

Требования:
- Обязательно включи "app/page.tsx". Не экономь на количестве файлов и компонентов —
  раскладывай интерфейс так, как это сделал бы опытный frontend-разработчик на реальном
  проекте (отдельные компоненты, hooks/, lib/ для клиентской логики).
- Спроектируй ПРОДУКТ, а не витрину: продумай реальные экраны и состояния (пустое,
  загрузка, ошибка), а не одну страницу с текстом.
- Пути только внутри app/, components/, hooks/ или lib/; расширение .tsx или .ts.
- Описание purpose — 1 короткое предложение на русском.
Ответь только JSON.`
}

async function generateManifest(name: string, hint: string | undefined, brief: DesignBrief): Promise<ManifestEntry[] | null> {
  const text = await callAnyProvider(buildManifestPrompt(name, hint, brief), 4096)
  if (!text) return null

  const parsed = extractJson(text)
  const rawFiles = Array.isArray(parsed?.files) ? parsed.files : []

  const entries: ManifestEntry[] = rawFiles
    .filter((f: any) => f && typeof f.path === "string" && typeof f.purpose === "string")
    .map((f: any) => ({ path: f.path.replace(/^\/+/, ""), purpose: f.purpose }))
    .filter((f: ManifestEntry) => /^(app|components|hooks|lib)\/[\w\-/]+\.tsx?$/.test(f.path))
    .filter((f: ManifestEntry) => !RESERVED_PATHS.has(f.path.toLowerCase()))
    .slice(0, 40)

  if (!entries.some((f) => f.path === "app/page.tsx")) {
    entries.unshift({ path: "app/page.tsx", purpose: "Главная страница приложения" })
  }

  return entries.length > 0 ? entries : null
}

function fallbackManifest(): ManifestEntry[] {
  return [{ path: "app/page.tsx", purpose: "Главная страница приложения" }]
}

/** Промпт содержимого файла. Ключевое здесь — блок дизайн-контракта: файлы
 *  генерируются ПАРАЛЛЕЛЬНО и не видят друг друга, поэтому без общего контракта
 *  каждый изобретал собственную палитру, и приложение расползалось по стилю. */
function buildFilePrompt(
  name: string,
  hint: string | undefined,
  manifest: ManifestEntry[],
  entry: ManifestEntry,
  brief: DesignBrief,
  lessons: string,
): string {
  const fileList = manifest.map((f) => `- ${f.path}: ${f.purpose}`).join("\n")
  return `Ты пишешь исходный код для реального Next.js (App Router, TypeScript, Tailwind CSS) приложения "${name}"${hint ? ` в теме: "${hint}"` : ""}.

Полный список файлов приложения (для контекста, чтобы импорты между ними совпадали):
${fileList}

${renderDesignContract(brief)}
${lessons ? `
${lessons}
` : ""}
Сейчас напиши ПОЛНОЕ содержимое файла "${entry.path}" (${entry.purpose}).

Требования:
- Валидный TypeScript/TSX, готовый к сборке Next.js App Router (используй "use client" только если нужны хуки/интерактивность).
- Стилизация только через Tailwind-классы дизайн-контракта выше.
- Импорты компонентов из "./ComponentName" или "@/components/ComponentName" — точно соответствуй путям из списка выше.
- Приложение собирается через "next build" со статическим экспортом (output: "export") —
  без серверных API-роутов и Server Actions. Обращения к внешним API возможны только
  клиентски (компонент с "use client" + fetch/useEffect), не через серверные компоненты.
- Верни ТОЛЬКО код в одном \`\`\`tsx блоке, без пояснений до или после.`
}

async function generateFileContent(
  name: string,
  hint: string | undefined,
  manifest: ManifestEntry[],
  entry: ManifestEntry,
  brief: DesignBrief,
  lessons: string,
): Promise<string | null> {
  const text = await callAnyProvider(buildFilePrompt(name, hint, manifest, entry, brief, lessons), 8000)
  if (!text) return null
  return extractCodeBlock(text)
}

/** Промпт ремонта файла: инженерные дефекты + текущий код → исправленный файл целиком.
 *  Модель чинит КОНКРЕТНЫЕ нарушения контракта сборки, а не переизобретает файл:
 *  замысел уже выбран, второй облик поверх первого нам не нужен. */
function buildRepairPrompt(params: {
  name: string
  hint?: string
  path: string
  purpose: string
  current: string
  defects: string
  brief: DesignBrief
  siblings: string[]
}): string {
  const { name, hint, path, purpose, current, defects, brief, siblings } = params
  return `Ты чинишь один файл реального Next.js (App Router, TypeScript, Tailwind) приложения "${name}"${hint ? ` в теме: "${hint}"` : ""}.

Файлы приложения (импортировать можно ТОЛЬКО их):
${siblings.map((s) => `- ${s}`).join("\n")}

${renderDesignContract(brief)}

Файл: "${path}" (${purpose}).

ИНЖЕНЕРНЫЕ ДЕФЕКТЫ, которые обязан устранить (проверено сборщиком, не мнение):
${defects}

Текущее содержимое файла:
\`\`\`tsx
${current.slice(0, 12000)}
\`\`\`

Требования к ответу:
- Верни ПОЛНОЕ исправленное содержимое файла, а не патч и не пояснения.
- Сохрани замысел и вёрстку файла — правь ровно то, что перечислено в дефектах.
- Импортируй только существующие файлы из списка выше; сторонние пакеты запрещены,
  кроме next, react и react-dom.
- Если нужен хук или обработчик события — первой строкой файла поставь "use client".
- Приложение собирается со статическим экспортом (output: "export"): без API-роутов,
  без "use server", без next/headers, без export const dynamic.
- Верни ТОЛЬКО код в одном \`\`\`tsx блоке.`
}

/**
 * AI-ремонт одного файла по списку инженерных дефектов. Возвращает null, если
 * провайдеров нет или все промолчали — вызывающая сторона обязана считать это
 * «починить не удалось», а не «файл в порядке» (см. lib/project-engineering.ts).
 */
export async function repairFileWithAi(params: {
  name: string
  hint?: string
  path: string
  purpose?: string
  current: string
  defects: string
  brief: DesignBrief
  siblings: string[]
}): Promise<string | null> {
  if (!isAiConfigured()) return null
  try {
    const prompt = buildRepairPrompt({
      ...params,
      purpose: params.purpose || "файл приложения",
    })
    const text = await callAnyProvider(prompt, 8000)
    if (!text) return null
    const code = extractCodeBlock(text)
    return code && code.trim().length >= 20 ? code : null
  } catch (err) {
    captureError("[app-generator] AI-ремонт файла не удался:", err)
    return null
  }
}

/**
 * Основная точка входа: генерирует полный набор файлов реального приложения.
 * Никогда не бросает исключение — при любой ошибке/отсутствии AI возвращает
 * минимальный рабочий статический проект (source: "fallback").
 *
 * Дизайн-система выводится ДО генерации кода и возвращается наружу: вызывающая
 * сторона сохраняет бриф вместе с проектом, и витрина показывает, из чего сложился
 * облик приложения. Даже путь fallback (AI не сконфигурирован) получает полноценные
 * токены — раньше там была страница на `bg-slate-950` с голым белым текстом.
 */
export async function generateApp(
  name: string,
  hint?: string,
  options?: {
    bypassCache?: boolean
    theme?: string
    keywords?: string[]
    description?: string
    /** Готовый бриф (доработка существующего проекта): арт-дирекция пропускается,
     *  чтобы доработка шла в том же визуальном языке, а не рождала второй облик. */
    brief?: DesignBrief
    /** Блок «выученные уроки» из корпуса ремесла (lib/craft-corpus): реальная
     *  статистика поломок этой платформы, чтобы генератор не повторял свои ошибки. */
    lessons?: string
  },
): Promise<AppGenerationResult> {
  const baseBrief = options?.brief ?? deriveDesignBrief({ name, hint, theme: options?.theme, keywords: options?.keywords })
  const description = options?.description ?? ""
  const lessons = options?.lessons ?? ""

  if (!isAiConfigured()) {
    return {
      files: [
        ...staticTemplateFiles(name, baseBrief, description),
        { path: "app/page.tsx", content: renderFallbackPage(baseBrief, name, hint) },
      ],
      source: "fallback",
      brief: baseBrief,
    }
  }

  // Кеш: одинаковый промпт → готовый результат без повторной генерации.
  // При bypassCache (глубокая генерация) чтение кеша пропускаем — гарантируем
  // свежий результат с нуля, хотя записать его в кеш всё равно можем.
  const cacheKey = appCacheKey(name, hint)
  if (!options?.bypassCache) {
    const cached = durableCache.get<{ files: GeneratedAppFile[]; brief: DesignBrief }>(cacheKey)
    if (cached && Array.isArray(cached.files) && cached.files.length > 0 && cached.brief) {
      return { files: cached.files, source: "ai", brief: cached.brief }
    }
  }

  try {
    // Шаг 1: арт-дирекция. Один короткий вызов задаёт характер, которому подчинятся
    // все последующие файлы. Результат зажат кодом — см. clampBriefProposal.
    // Готовый бриф (доработка) арт-дирекцию не запускает — облик уже выбран.
    const brief = options?.brief ?? (await directDesign(name, hint, baseBrief))
    const template = staticTemplateFiles(name, brief, description)

    const manifest = (await generateManifest(name, hint, brief)) || fallbackManifest()

    const generated = await Promise.all(
      manifest.map(async (entry) => {
        const content = await generateFileContent(name, hint, manifest, entry, brief, lessons)
        return {
          path: entry.path,
          content: content ?? (entry.path === "app/page.tsx" ? renderFallbackPage(brief, name, hint) : null),
        }
      }),
    )

    const files = generated.filter((f): f is GeneratedAppFile => typeof f.content === "string")

    if (!files.some((f) => f.path === "app/page.tsx")) {
      files.push({ path: "app/page.tsx", content: renderFallbackPage(brief, name, hint) })
    }

    const source: "ai" | "fallback" = files.length > 0 ? "ai" : "fallback"
    const allFiles = [...template, ...files]
    // Кешируем только реальный ai-результат, чтобы не «залипал» fallback.
    if (source === "ai") durableCache.set(cacheKey, { files: allFiles, brief }, APP_CACHE_TTL_SECONDS)
    return { files: allFiles, source, brief }
  } catch (err) {
    captureError("[app-generator] generation failed, falling back:", err)
    return {
      files: [
        ...staticTemplateFiles(name, baseBrief, description),
        { path: "app/page.tsx", content: renderFallbackPage(baseBrief, name, hint) },
      ],
      source: "fallback",
      brief: baseBrief,
    }
  }
}

/** Синтаксическая валидация сгенерированных .ts/.tsx файлов через TypeScript-компилятор
 *  (transpileModule — быстрая проверка без типов/node_modules, не блокирует сохранение). */
export function validateGeneratedFiles(files: GeneratedAppFile[]): string[] {
  const errors: string[] = []
  let ts: typeof import("typescript") | null = null
  try {
    ts = require("typescript")
  } catch {
    return errors // typescript недоступен во время исполнения — пропускаем валидацию
  }

  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) continue
    try {
      const result = ts!.transpileModule(file.content, {
        reportDiagnostics: true,
        compilerOptions: { jsx: ts!.JsxEmit.Preserve, module: ts!.ModuleKind.ESNext },
      })
      const diagnostics = result.diagnostics || []
      for (const d of diagnostics) {
        if (d.category === ts!.DiagnosticCategory.Error) {
          const message = ts!.flattenDiagnosticMessageText(d.messageText, "\n")
          errors.push(`${file.path}: ${message}`)
        }
      }
    } catch (err: any) {
      errors.push(`${file.path}: ${err?.message || "unknown parse error"}`)
    }
  }

  return errors
}
