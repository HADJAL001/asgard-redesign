import { BaseAgent, generateFilesFromManifest } from "./base-agent"
import type { ManifestEntry } from "../app-generator"
import type { TesterAgentInput, TestArtifact, GeneratedFile } from "./types"

/* ================================================================
   OSGARD · TesterAgent
   ----------------------------------------------------------------
   Вход: FrontendArtifact + BackendArtifact. Выход: TestArtifact —
   Jest unit-тесты для бэкенд-роутов и Playwright e2e-тесты для
   фронтенд-страниц. В отличие от BackendAgent манифест НЕ запрашивается
   у AI — он строится детерминированно из уже известных файлов
   входных артефактов (надёжнее и дешевле: AI не может ошибиться
   в именах несуществующих исходников), а AI вызывается только на
   втором шаге — для содержимого каждого тестового файла.
   ================================================================ */

interface TestPlanEntry {
  testPath: string
  purpose: string
  sourcePath: string
  sourceContent: string
  kind: "unit" | "e2e"
}

function slug(path: string): string {
  return path
    .replace(/\.(ts|tsx|js|jsx)$/, "")
    .replace(/[\\/]/g, "-")
    .replace(/[^a-zA-Z0-9\-_]/g, "-")
}

function isFrontendPage(path: string): boolean {
  return /\.(tsx|jsx)$/.test(path) && (path.includes("page.") || path.startsWith("app/") || path.startsWith("components/"))
}

function buildTestPlan(input: TesterAgentInput): TestPlanEntry[] {
  const plan: TestPlanEntry[] = []

  const backendRoutes = input.backend.files.filter((f) => /^routes\/[\w\-]+\.ts$/.test(f.path)).slice(0, 5)
  for (const f of backendRoutes) {
    plan.push({
      testPath: `tests/unit/${slug(f.path)}.test.ts`,
      purpose: `Jest unit tests for backend route ${f.path}`,
      sourcePath: f.path,
      sourceContent: f.content,
      kind: "unit",
    })
  }

  const frontendPages = input.frontend.files.filter((f) => isFrontendPage(f.path)).slice(0, 3)
  for (const f of frontendPages) {
    plan.push({
      testPath: `e2e/${slug(f.path)}.spec.ts`,
      purpose: `Playwright e2e test for frontend page ${f.path}`,
      sourcePath: f.path,
      sourceContent: f.content,
      kind: "e2e",
    })
  }

  return plan.slice(0, 8)
}

function buildFilePrompt(entry: TestPlanEntry): string {
  if (entry.kind === "unit") {
    return `Ты — Тестировщик в мультиагентном пайплайне генерации проектов OSGARD.
Дан исходный код backend-роута "${entry.sourcePath}":
\`\`\`ts
${entry.sourceContent}
\`\`\`

Напиши Jest unit-тесты (файл "${entry.testPath}"), покрывающие основные сценарии этого роута: успешный случай, невалидный ввод, 401/404 где применимо.
Требования:
- jest + supertest (или прямой вызов экспортированных handler-функций, если роут их экспортирует отдельно от Router) — ориентируйся на реальный экспорт из исходника.
- Мокай доступ к БД (db.prepare/db.exec), не подключайся к реальной SQLite.
- Верни ТОЛЬКО код в одном \`\`\`ts блоке, без пояснений.`
  }

  return `Ты — Тестировщик в мультиагентном пайплайне генерации проектов OSGARD.
Дан исходный код фронтенд-страницы "${entry.sourcePath}":
\`\`\`tsx
${entry.sourceContent}
\`\`\`

Напиши Playwright e2e-тест (файл "${entry.testPath}"), проверяющий, что страница загружается без ошибок консоли, ключевые элементы видимы, и (если есть форма/кнопки) базовое взаимодействие работает.
Требования:
- import { test, expect } from "@playwright/test".
- Не хардкодь абсолютный домен — переходи по относительному пути через page.goto("/...").
- Верни ТОЛЬКО код в одном \`\`\`ts блоке, без пояснений.`
}

function fallbackTestFiles(): GeneratedFile[] {
  return [
    {
      path: "tests/unit/health.test.ts",
      content: `import { describe, it, expect } from "@jest/globals"

describe("backend smoke test", () => {
  it("test harness runs", () => {
    expect(true).toBe(true)
  })
})
`,
    },
    {
      path: "e2e/homepage.spec.ts",
      content: `import { test, expect } from "@playwright/test"

test("homepage loads without console errors", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (err) => errors.push(err.message))

  await page.goto("/")
  expect(errors).toHaveLength(0)
})
`,
    },
  ]
}

export class TesterAgent extends BaseAgent<TesterAgentInput, TestArtifact> {
  readonly name = "tester"

  async execute(input: TesterAgentInput): Promise<TestArtifact> {
    const plan = buildTestPlan(input)
    if (plan.length === 0) {
      return { type: "tests", files: fallbackTestFiles(), source: "fallback" }
    }

    const manifest: ManifestEntry[] = plan.map((e) => ({ path: e.testPath, purpose: e.purpose }))
    const planByPath = new Map(plan.map((e) => [e.testPath, e]))

    const files = await generateFilesFromManifest({
      manifest,
      filePrompt: (entry) => buildFilePrompt(planByPath.get(entry.path)!),
      fileMaxTokens: 3000,
      logLabel: "tester-agent",
    })

    if (files) return { type: "tests", files, source: "ai" }
    return { type: "tests", files: fallbackTestFiles(), source: "fallback" }
  }
}
