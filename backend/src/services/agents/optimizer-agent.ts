import { BaseAgent, generateReview, regenerateFile } from "./base-agent"
import type { GeneratedFile, OptimizationCategory, OptimizationSuggestion, OptimizedArtifact, OptimizerAgentInput } from "./types"

/* ================================================================
   OSGARD · OptimizerAgent
   ----------------------------------------------------------------
   Вход: все артефакты пайплайна (schema, frontend, backend, tests).
   Выход: OptimizedArtifact — список конкретных предложений по
   производительности (мемоизация, lazy loading, сжатие, кэширование,
   запросы к БД), из которых до 3 самых воздействующих (autoApply)
   применяются реальной AI-перезаписью файла. Остальные остаются
   рекомендациями (applied: false) — Optimizer не переписывает весь
   проект, только точечные патчи.
   ================================================================ */

const MAX_AUTO_APPLY = 3
const PREVIEW_CHARS = 800

function allFiles(input: OptimizerAgentInput): GeneratedFile[] {
  return [...input.frontend.files, ...input.backend.files, ...input.tests.files]
}

function findFile(input: OptimizerAgentInput, path: string): GeneratedFile | undefined {
  return allFiles(input).find((f) => f.path === path)
}

function buildReviewPrompt(input: OptimizerAgentInput): string {
  const files = allFiles(input).slice(0, 15)
  const listing = files
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, PREVIEW_CHARS)}${f.content.length > PREVIEW_CHARS ? "\n...(обрезано)" : ""}`)
    .join("\n\n")

  return `Ты — Оптимизатор в мультиагентном пайплайне генерации проектов OSGARD.
Проект "${input.schema.name}". Ниже — файлы проекта (могут быть обрезаны):

${listing}

Найди конкретные возможности оптимизации производительности: мемоизация React-компонентов, lazy loading тяжёлых импортов, сжатие ответов, N+1/неэффективные SQL-запросы, отсутствие кэширования.

Верни СТРОГО валидный JSON (без markdown, без пояснений) вида:
{
  "suggestions": [
    {
      "file": "путь к файлу из списка выше",
      "issue": "что именно неоптимально, 1 предложение",
      "suggestion": "конкретное исправление, 1 предложение",
      "category": "один из: memoization, lazy-loading, compression, bundle-size, query, caching, other",
      "autoApply": true или false
    }
  ]
}
Требования:
- От 1 до 8 предложений, только по файлам из списка выше.
- autoApply: true — только для предложений, которые безопасно применить точечным изменением файла, не ломая остальной проект (максимум 3 таких).
Ответь только JSON.`
}

function buildPatchPrompt(file: GeneratedFile, suggestion: { issue: string; suggestion: string }): string {
  return `Ты переписываешь файл "${file.path}" проекта OSGARD, применяя ОДНО конкретное оптимизационное исправление.

Текущее содержимое файла:
\`\`\`
${file.content}
\`\`\`

Проблема: ${suggestion.issue}
Исправление: ${suggestion.suggestion}

Требования:
- Примени ТОЛЬКО описанное исправление, не меняй остальную логику файла.
- Сохрани существующие импорты/экспорты/сигнатуры, если их не требуется менять для исправления.
- Верни ТОЛЬКО полное новое содержимое файла в одном \`\`\` блоке, без пояснений.`
}

interface RawSuggestion {
  file?: string
  issue?: string
  suggestion?: string
  category?: string
  autoApply?: boolean
}

const VALID_CATEGORIES: OptimizationCategory[] = ["memoization", "lazy-loading", "compression", "bundle-size", "query", "caching", "other"]

function normalizeCategory(c: any): OptimizationCategory {
  return VALID_CATEGORIES.includes(c) ? c : "other"
}

async function applyAiSuggestions(input: OptimizerAgentInput): Promise<OptimizedArtifact | null> {
  const review = await generateReview<{ suggestions?: RawSuggestion[] }>(buildReviewPrompt(input), 3000, "optimizer-agent")
  const rawSuggestions = Array.isArray(review?.suggestions) ? review!.suggestions! : []

  const valid = rawSuggestions.filter(
    (s): s is Required<RawSuggestion> => !!s.file && !!s.issue && !!s.suggestion && !!findFile(input, s.file),
  )
  if (valid.length === 0) return null

  let autoApplyBudget = MAX_AUTO_APPLY
  const files: GeneratedFile[] = []
  const suggestions: OptimizationSuggestion[] = []

  for (const raw of valid) {
    const category = normalizeCategory(raw.category)
    const wantsAutoApply = raw.autoApply === true && autoApplyBudget > 0

    if (wantsAutoApply) {
      const sourceFile = findFile(input, raw.file)!
      const patched = await regenerateFile(buildPatchPrompt(sourceFile, raw), 6000, "optimizer-agent-patch")
      if (patched) {
        autoApplyBudget -= 1
        files.push({ path: raw.file, content: patched })
        suggestions.push({ file: raw.file, issue: raw.issue, suggestion: raw.suggestion, category, applied: true })
        continue
      }
    }

    suggestions.push({ file: raw.file, issue: raw.issue, suggestion: raw.suggestion, category, applied: false })
  }

  return { type: "optimized", files, suggestions, source: "ai" }
}

function heuristicSuggestions(input: OptimizerAgentInput): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = []

  const server = input.backend.files.find((f) => f.path === "server.ts")
  if (server && !/compression\s*\(/.test(server.content)) {
    suggestions.push({
      file: server.path,
      issue: "Express-сервер не использует middleware сжатия ответов",
      suggestion: 'Подключить пакет "compression" и добавить app.use(compression()) перед роутами',
      category: "compression",
      applied: false,
    })
  }

  for (const f of input.frontend.files) {
    if (!/\.(tsx|jsx)$/.test(f.path)) continue
    const mapCount = (f.content.match(/\.map\(/g) || []).length
    if (mapCount >= 2 && !/React\.memo|memo\(/.test(f.content)) {
      suggestions.push({
        file: f.path,
        issue: `Компонент рендерит списки (${mapCount}x .map()) без мемоизации дочерних элементов`,
        suggestion: "Обернуть элементы списка в React.memo, чтобы избежать лишних перерисовок",
        category: "memoization",
        applied: false,
      })
    }
    if (f.content.length > 3000 && !/next\/dynamic/.test(f.content)) {
      suggestions.push({
        file: f.path,
        issue: "Крупный компонент импортируется статически и попадает в основной бандл",
        suggestion: 'Вынести компонент через next/dynamic (dynamic(() => import(...), { ssr: false }))',
        category: "lazy-loading",
        applied: false,
      })
    }
  }

  for (const f of input.backend.files) {
    if (!/^routes\//.test(f.path)) continue
    if (/SELECT\s+\*/i.test(f.content)) {
      suggestions.push({
        file: f.path,
        issue: "SQL-запрос выбирает все колонки (SELECT *) вместо нужных полей",
        suggestion: "Явно перечислить нужные колонки в SELECT, чтобы уменьшить объём передаваемых данных",
        category: "query",
        applied: false,
      })
    }
    if (/router\.get\(/.test(f.content) && !/cache|Cache-Control|etag/i.test(f.content)) {
      suggestions.push({
        file: f.path,
        issue: "GET-роуты не используют кэширование (ни in-memory, ни HTTP-заголовки)",
        suggestion: "Добавить Cache-Control/ETag для читающих эндпоинтов или обернуть в cacheService.getOrSet",
        category: "caching",
        applied: false,
      })
    }
  }

  return suggestions.slice(0, 10)
}

export class OptimizerAgent extends BaseAgent<OptimizerAgentInput, OptimizedArtifact> {
  readonly name = "optimizer"

  async execute(input: OptimizerAgentInput): Promise<OptimizedArtifact> {
    const aiResult = await applyAiSuggestions(input)
    if (aiResult) return aiResult

    return { type: "optimized", files: [], suggestions: heuristicSuggestions(input), source: "fallback" }
  }
}
