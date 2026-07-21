import { callClaudeRaw, callDeepSeekRaw, callGrokRaw, extractJson, isAiConfigured } from "./ai-router"

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

/** Статический базовый шаблон Next.js-приложения — не генерируется AI, всегда стабилен. */
function staticTemplateFiles(name: string): GeneratedAppFile[] {
  const slug = slugify(name)

  return [
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
      path: "tailwind.config.ts",
      content: `import type { Config } from "tailwindcss"\n\nconst config: Config = {\n  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],\n  theme: { extend: {} },\n  plugins: [],\n}\n\nexport default config\n`,
    },
    {
      path: "postcss.config.js",
      content: `module.exports = {\n  plugins: { tailwindcss: {}, autoprefixer: {} },\n}\n`,
    },
    {
      path: "app/globals.css",
      content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`,
    },
    {
      path: "app/layout.tsx",
      content: `import type { Metadata } from "next"\nimport "./globals.css"\n\nexport const metadata: Metadata = {\n  title: "${name.replace(/"/g, '\\"')}",\n}\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="ru">\n      <body>{children}</body>\n    </html>\n  )\n}\n`,
    },
    {
      path: "README.md",
      content: `# ${name}\n\nПриложение сгенерировано в OSGARD. Это реальный Next.js-проект: можно запускать\nлокально (\`npm install && npm run dev\`), редактировать и публиковать на GitHub.\n`,
    },
  ]
}

const RESERVED_PATHS = new Set(
  staticTemplateFiles("x").map((f) => f.path.toLowerCase()),
)

function buildManifestPrompt(name: string, hint?: string): string {
  return `Ты — генератор реальных React/Next.js (App Router) приложений для платформы OSGARD.
Пользователь хочет приложение с названием "${name}"${hint ? ` в направлении/теме: "${hint}"` : ""}.

Спроектируй короткий список файлов приложения (страницы в app/, при необходимости компоненты в components/).
Базовые файлы (package.json, next.config.js, app/layout.tsx, tailwind и т.д.) уже есть — их не включай.

Верни СТРОГО валидный JSON (без markdown, без пояснений) вида:
{
  "files": [
    { "path": "app/page.tsx", "purpose": "главная страница — краткое описание содержимого" },
    { "path": "components/Hero.tsx", "purpose": "..." }
  ]
}

Требования:
- От 1 до 6 файлов, обязательно включи "app/page.tsx".
- Пути только внутри app/ или components/, расширение .tsx.
- Описание purpose — 1 короткое предложение на русском.
Ответь только JSON.`
}

async function generateManifest(name: string, hint?: string): Promise<ManifestEntry[] | null> {
  const text = await callAnyProvider(buildManifestPrompt(name, hint), 2048)
  if (!text) return null

  const parsed = extractJson(text)
  const rawFiles = Array.isArray(parsed?.files) ? parsed.files : []

  const entries: ManifestEntry[] = rawFiles
    .filter((f: any) => f && typeof f.path === "string" && typeof f.purpose === "string")
    .map((f: any) => ({ path: f.path.replace(/^\/+/, ""), purpose: f.purpose }))
    .filter((f: ManifestEntry) => /^(app|components)\/[\w\-/]+\.tsx$/.test(f.path))
    .filter((f: ManifestEntry) => !RESERVED_PATHS.has(f.path.toLowerCase()))
    .slice(0, 6)

  if (!entries.some((f) => f.path === "app/page.tsx")) {
    entries.unshift({ path: "app/page.tsx", purpose: "Главная страница приложения" })
  }

  return entries.length > 0 ? entries : null
}

function fallbackManifest(): ManifestEntry[] {
  return [{ path: "app/page.tsx", purpose: "Главная страница приложения" }]
}

function buildFilePrompt(name: string, hint: string | undefined, manifest: ManifestEntry[], entry: ManifestEntry): string {
  const fileList = manifest.map((f) => `- ${f.path}: ${f.purpose}`).join("\n")
  return `Ты пишешь исходный код для реального Next.js (App Router, TypeScript, Tailwind CSS) приложения "${name}"${hint ? ` в теме: "${hint}"` : ""}.

Полный список файлов приложения (для контекста, чтобы импорты между ними совпадали):
${fileList}

Сейчас напиши ПОЛНОЕ содержимое файла "${entry.path}" (${entry.purpose}).

Требования:
- Валидный TypeScript/TSX, готовый к сборке Next.js App Router (используй "use client" только если нужны хуки/интерактивность).
- Стилизация через Tailwind CSS классы.
- Импорты компонентов из "./ComponentName" или "@/components/ComponentName" — точно соответствуй путям из списка выше.
- Никаких внешних API-запросов, только статичный контент и React state.
- Верни ТОЛЬКО код в одном \`\`\`tsx блоке, без пояснений до или после.`
}

async function generateFileContent(
  name: string,
  hint: string | undefined,
  manifest: ManifestEntry[],
  entry: ManifestEntry,
): Promise<string | null> {
  const text = await callAnyProvider(buildFilePrompt(name, hint, manifest, entry), 8000)
  if (!text) return null
  return extractCodeBlock(text)
}

function fallbackPageContent(name: string, hint?: string): string {
  const safeName = name.replace(/`/g, "'")
  const safeHint = (hint || "").replace(/`/g, "'")
  return `export default function Page() {\n  return (\n    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-center text-white">\n      <h1 className="text-3xl font-bold">${safeName}</h1>\n      <p className="max-w-md text-slate-400">${safeHint || "Приложение создано в OSGARD."}</p>\n    </main>\n  )\n}\n`
}

/**
 * Основная точка входа: генерирует полный набор файлов реального приложения.
 * Никогда не бросает исключение — при любой ошибке/отсутствии AI возвращает
 * минимальный рабочий статический проект (source: "fallback").
 */
export async function generateApp(name: string, hint?: string): Promise<AppGenerationResult> {
  const template = staticTemplateFiles(name)

  if (!isAiConfigured()) {
    return {
      files: [...template, { path: "app/page.tsx", content: fallbackPageContent(name, hint) }],
      source: "fallback",
    }
  }

  try {
    const manifest = (await generateManifest(name, hint)) || fallbackManifest()

    const generated = await Promise.all(
      manifest.map(async (entry) => {
        const content = await generateFileContent(name, hint, manifest, entry)
        return { path: entry.path, content: content ?? (entry.path === "app/page.tsx" ? fallbackPageContent(name, hint) : null) }
      }),
    )

    const files = generated.filter((f): f is GeneratedAppFile => typeof f.content === "string")

    if (!files.some((f) => f.path === "app/page.tsx")) {
      files.push({ path: "app/page.tsx", content: fallbackPageContent(name, hint) })
    }

    return { files: [...template, ...files], source: files.length > 0 ? "ai" : "fallback" }
  } catch (err) {
    console.error("[app-generator] generation failed, falling back:", err)
    return {
      files: [...template, { path: "app/page.tsx", content: fallbackPageContent(name, hint) }],
      source: "fallback",
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
