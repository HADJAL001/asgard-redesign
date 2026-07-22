import { callClaudeApi, callDeepSeek } from "../services/ai-router"
import { captureError } from "../lib/sentry"
import { BaseAgent } from "./base-agent"
import {
  FrontendArtifactSchema,
  type FrontendArtifact,
  type ProjectSchema,
  type DesignSystem,
  type PageEntry,
  type PipelineArtifact,
  type PipelineArtifactSource,
  type PipelineArtifactType,
} from "./types"

/* ================================================================
   OSGARD · Агент «Frontend-разработчик»
   ----------------------------------------------------------------
   Вход: ProjectSchema (от Архитектора) + DesignSystem (от Дизайнера).
   Выход: FrontendArtifact — дерево файлов реального Next.js/Tailwind
   проекта.

   В отличие от остальных 3 агентов, execute() здесь переопределён:
   результат — не единый JSON-объект, а дерево файлов, часть из
   которых (конфиги, layout, globals.css) собирается детерминированно
   из DesignSystem/ProjectSchema (без AI — они не нуждаются в
   творчестве и не должны ломаться из-за отсутствия API-ключей), а
   контент страниц (файлы page.tsx внутри app) генерируется по одному AI-вызову
   на страницу (первые MAX_AI_PAGES — иначе одна генерация могла бы
   уйти в минуты и упереться в лимиты токенов). Тот же принцип
   "манифест/скелет отдельно, контент файла — отдельным сырым
   вызовом" уже применяется в services/app-generator.ts.
   ================================================================ */

export interface FrontendAgentInput {
  schema: ProjectSchema
  design: DesignSystem
}

const MAX_AI_PAGES = 5
const PAGE_MAX_TOKENS = 2048

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "osgard-frontend"
}

/** Достаёт код из ```-фенса ответа модели — без JSON.parse, т.к. исходный код содержит
 *  кавычки/шаблонные строки, которые ломают JSON-экранирование (см. app-generator.ts). */
function extractCodeBlock(text: string): string | null {
  const fenced = text.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : text).trim()
  return candidate.length > 0 ? candidate : null
}

/** Конвертирует параметры маршрута (":id", "{id}") в синтаксис Next.js App Router ("[id]"),
 *  т.к. модель/архитектор может вернуть параметр в REST-нотации (см. ApiEndpointSchema.path). */
function routeToFilePath(route: string): string {
  const clean = route
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((segment) => {
      const param = segment.match(/^[:{](\w+)[}]?$/)
      return param ? `[${param[1]}]` : segment
    })
    .join("/")
  return clean ? `app/${clean}/page.tsx` : "app/page.tsx"
}

function componentName(pageName: string): string {
  const pascal = pageName
    .replace(/[^a-zA-Zа-яА-Я0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("")
  return `${pascal || "Page"}Page`
}

function fallbackPageContent(page: PageEntry): string {
  const name = componentName(page.name)
  return `export default function ${name}() {
  return (
    <main className="min-h-screen bg-background text-foreground p-8">
      <h1 className="text-3xl font-bold">${page.name.replace(/`/g, "'")}</h1>
      <p className="mt-4 text-muted-foreground">${page.description.replace(/`/g, "'")}</p>
    </main>
  )
}
`
}

export class FrontendAgent extends BaseAgent<FrontendAgentInput, FrontendArtifact> {
  readonly role = "Frontend-разработчик"
  readonly artifactType: PipelineArtifactType = "frontend"
  readonly schema = FrontendArtifactSchema

  /** Не вызывается напрямую (см. execute() ниже) — реализован для соответствия абстрактному
   *  контракту BaseAgent; buildPagePrompt() ниже — фактический промт, используемый по странице. */
  protected buildPrompt(input: FrontendAgentInput): string {
    return this.buildPagePrompt(input.schema.pages[0], input)
  }

  private buildPagePrompt(page: PageEntry, input: FrontendAgentInput): string {
    return `Ты — Frontend-разработчик в команде OSGARD. Напиши код страницы Next.js App Router
(TypeScript, Tailwind CSS) для маршрута "${page.route}".

Контекст страницы: ${page.name} — ${page.description}
Схема проекта: ${input.schema.name}
Цвета дизайн-системы (CSS custom properties, доступны через Tailwind как bg-primary/text-foreground и т.д.):
${input.design.colors.map((c) => `--${c.name}: ${c.value}; /* ${c.usage} */`).join("\n")}

Требования:
- Один файл: default export React-компонент (Server Component, без "use client", если не нужна интерактивность).
- Используй только Tailwind-классы, без inline-стилей и сторонних CSS-файлов.
- Только реальный TypeScript/TSX код, без комментариев-объяснений и без markdown-текста вне блока.
Верни ТОЛЬКО один код-блок \`\`\`tsx ... \`\`\` с содержимым файла.`
  }

  private buildScaffoldFiles(input: FrontendAgentInput): FrontendArtifact["files"] {
    const slug = slugify(input.schema.name)
    const cssVars = input.design.colors.map((c) => `  --${c.name}: ${c.value};`).join("\n")

    return [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: slug,
            version: "0.1.0",
            private: true,
            scripts: { dev: "next dev", build: "next build", start: "next start" },
            dependencies: Object.fromEntries(input.schema.dependencies.map((d) => [d.name, d.version])),
          },
          null,
          2,
        ),
      },
      {
        path: "tailwind.config.ts",
        content: `import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: ${input.design.darkMode ? '"class"' : "false"},
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: ${JSON.stringify(input.design.tailwindConfigExtend, null, 2)},
  },
  plugins: [],
}

export default config
`,
      },
      {
        path: "postcss.config.js",
        content: `module.exports = {\n  plugins: { tailwindcss: {}, autoprefixer: {} },\n}\n`,
      },
      {
        path: "app/globals.css",
        content: `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n:root {\n${cssVars}\n  --radius: ${input.design.borderRadius};\n  --font-body: ${input.design.typography.fontFamily};\n}\n\nbody {\n  background-color: var(--background);\n  color: var(--foreground);\n  font-family: var(--font-body);\n}\n`,
      },
      {
        path: "app/layout.tsx",
        content: `import type { Metadata } from "next"\nimport "./globals.css"\n\nexport const metadata: Metadata = {\n  title: "${input.schema.name.replace(/"/g, '\\"')}",\n}\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="ru">\n      <body>{children}</body>\n    </html>\n  )\n}\n`,
      },
    ]
  }

  protected buildFallback(input: FrontendAgentInput): FrontendArtifact {
    const scaffold = this.buildScaffoldFiles(input)
    const pageFiles = input.schema.pages.map((page) => ({
      path: routeToFilePath(page.route),
      content: fallbackPageContent(page),
    }))

    return {
      files: [...scaffold, ...pageFiles],
      componentsGenerated: [],
      pagesGenerated: input.schema.pages.map((p) => p.route),
      notes: "Сгенерировано локальным fallback-шаблоном (без AI).",
    }
  }

  async execute(input: FrontendAgentInput): Promise<PipelineArtifact<FrontendArtifact>> {
    return this.withCache(input, () => this.generateFrontend(input))
  }

  private async generateFrontend(input: FrontendAgentInput): Promise<PipelineArtifact<FrontendArtifact>> {
    const scaffold = this.buildScaffoldFiles(input)
    const aiPages = input.schema.pages.slice(0, MAX_AI_PAGES)
    const restPages = input.schema.pages.slice(MAX_AI_PAGES)

    let usedSource: PipelineArtifactSource | null = null
    const pageFiles: FrontendArtifact["files"] = []

    for (const page of aiPages) {
      const prompt = this.buildPagePrompt(page, input)
      let code: string | null = null

      try {
        const claudeText = await callClaudeApi(prompt, PAGE_MAX_TOKENS)
        code = claudeText ? extractCodeBlock(claudeText) : null
        if (code) usedSource = usedSource ?? "claude"
      } catch (err) {
        captureError(`[agents] ${this.role} Claude page call failed:`, err)
      }

      if (!code) {
        try {
          code = await callDeepSeek<string>(prompt, extractCodeBlock, "agent-frontend-page", PAGE_MAX_TOKENS)
          if (code) usedSource = usedSource ?? "deepseek"
        } catch (err) {
          captureError(`[agents] ${this.role} DeepSeek page call failed:`, err)
        }
      }

      pageFiles.push({ path: routeToFilePath(page.route), content: code ?? fallbackPageContent(page) })
    }

    for (const page of restPages) {
      pageFiles.push({ path: routeToFilePath(page.route), content: fallbackPageContent(page) })
    }

    const data: FrontendArtifact = {
      files: [...scaffold, ...pageFiles],
      componentsGenerated: [],
      pagesGenerated: input.schema.pages.map((p) => p.route),
      notes:
        restPages.length > 0
          ? `AI-генерация применена к первым ${MAX_AI_PAGES} страницам, остальные ${restPages.length} — по шаблону.`
          : "",
    }

    const validated = this.schema.safeParse(data)

    return {
      type: this.artifactType,
      agent: this.role,
      data: validated.success ? validated.data : this.buildFallback(input),
      source: validated.success ? usedSource ?? "fallback" : "fallback",
      createdAt: Date.now(),
    }
  }
}
