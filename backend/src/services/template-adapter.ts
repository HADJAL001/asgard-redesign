import { callAnyProvider, type GeneratedAppFile } from "./app-generator"
import type { AiArtifactSuggestion } from "./ai-generator"
import type { MatchedTemplate } from "./template-store"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · Умные шаблоны — адаптация закэшированной генерации
   ----------------------------------------------------------------
   Вместо повторной полной генерации (манифест ~2048 + N файлов по
   ~8000 токенов) при совпадении темы делается ОДИН короткий AI-вызов
   (~500-800 токенов), который обновляет только то, что пользователь
   реально видит: описание/бейдж/имена артефактов + содержимое трёх
   "лицевых" файлов (app/page.tsx, app/layout.tsx, README.md). Все
   остальные файлы шаблона переиспользуются байт-в-байт — они уже
   прошли tsc-валидацию при первой генерации.

   Ответ модели НЕ парсится как JSON целиком: код содержит кавычки и
   шаблонные строки, ломающие JSON-экранирование (та же причина, по
   которой app-generator.ts использует extractCodeBlock, а не
   extractJson, для содержимого файлов). Вместо этого секции
   разделены уникальными текстовыми маркерами и извлекаются строковым
   разбором.
   ================================================================ */

export type TemplateAdaptationResult = {
  description: string
  badge: string
  artifactNames: string[]
  files: GeneratedAppFile[]
  source: "template-ai" | "template-local"
}

const SECTION_MARKERS = ["===META===", "===PAGE===", "===LAYOUT===", "===README==="] as const

function buildAdaptationPrompt(template: MatchedTemplate, name: string, hint?: string): string {
  return `Ты адаптируешь уже готовое приложение под новое название, сохраняя его тему и структуру.
Тема приложения: "${template.theme}". Новое название: "${name}"${hint ? `, направление: "${hint}"` : ""}.

Текущее описание: "${template.description || ""}"
Текущий файл app/page.tsx:
${template.files.find((f) => f.path === "app/page.tsx")?.content || ""}

Верни ответ СТРОГО в следующем формате, без пояснений, разделяя секции указанными маркерами
ровно как показано (каждая секция на новой строке после маркера):

===META===
{"description": "новое короткое описание на русском, 1-2 предложения", "badge": "иконка одним словом", "artifactNames": ["имя1", "имя2", "имя3"]}
===PAGE===
полное содержимое app/page.tsx (TSX, Tailwind, тема "${template.theme}", адаптированное под "${name}")
===LAYOUT===
полное содержимое app/layout.tsx (metadata.title = "${name}")
===README===
полное содержимое README.md для проекта "${name}"`
}

function splitSections(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < SECTION_MARKERS.length; i++) {
    const marker = SECTION_MARKERS[i]
    const start = text.indexOf(marker)
    if (start === -1) continue
    const contentStart = start + marker.length
    const nextMarker = SECTION_MARKERS.slice(i + 1).find((m) => text.indexOf(m, contentStart) !== -1)
    const end = nextMarker ? text.indexOf(nextMarker, contentStart) : text.length
    result[marker] = text.slice(contentStart, end).trim()
  }
  return result
}

function stripCodeFence(text: string): string {
  const fenced = text.match(/```[a-zA-Z]*\r?\n([\s\S]*?)```/)
  return (fenced ? fenced[1] : text).trim()
}

/** Локальный фоллбэк без AI: переименовывает вхождения старого образца названия в новое
 *  во всех файлах шаблона — грубее, чем AI-адаптация, но всегда рабочий и бесплатный. */
function localAdapt(template: MatchedTemplate, name: string): TemplateAdaptationResult {
  const oldName = template.nameSample || template.theme
  const replaceName = (content: string) => content.split(oldName).join(name)

  const files = template.files.map((f) =>
    /\.(tsx?|md)$/.test(f.path) ? { path: f.path, content: replaceName(f.content) } : f,
  )

  return {
    description: template.description ? replaceName(template.description) : `${name} — проект в теме «${template.theme}».`,
    badge: template.badge || "sparkles",
    artifactNames: template.artifactTypes.map((a) => replaceName(a.name)),
    files,
    source: "template-local",
  }
}

/** Адаптирует закэшированный шаблон под новое название/подсказку — один короткий AI-вызов
 *  вместо полной регенерации. При недоступности/сбое AI — локальный фоллбэк (никогда не бросает). */
export async function adaptTemplate(
  template: MatchedTemplate,
  name: string,
  hint?: string,
): Promise<TemplateAdaptationResult> {
  try {
    const raw = await callAnyProvider(buildAdaptationPrompt(template, name, hint), 1500)
    if (!raw) return localAdapt(template, name)

    const sections = splitSections(raw)
    const metaRaw = sections["===META==="]
    if (!metaRaw) return localAdapt(template, name)

    let meta: { description?: string; badge?: string; artifactNames?: string[] }
    try {
      meta = JSON.parse(stripCodeFence(metaRaw))
    } catch {
      return localAdapt(template, name)
    }

    const description = typeof meta.description === "string" ? meta.description : template.description || ""
    const badge = typeof meta.badge === "string" ? meta.badge : template.badge || "sparkles"
    const artifactNames =
      Array.isArray(meta.artifactNames) && meta.artifactNames.every((n) => typeof n === "string")
        ? meta.artifactNames
        : template.artifactTypes.map((a) => a.name)

    const pageContent = sections["===PAGE==="] ? stripCodeFence(sections["===PAGE==="]) : null
    const layoutContent = sections["===LAYOUT==="] ? stripCodeFence(sections["===LAYOUT==="]) : null
    const readmeContent = sections["===README==="] ? stripCodeFence(sections["===README==="]) : null

    const overrides = new Map<string, string>()
    if (pageContent) overrides.set("app/page.tsx", pageContent)
    if (layoutContent) overrides.set("app/layout.tsx", layoutContent)
    if (readmeContent) overrides.set("README.md", readmeContent)

    const files = template.files.map((f) => (overrides.has(f.path) ? { path: f.path, content: overrides.get(f.path)! } : f))

    return { description, badge, artifactNames, files, source: "template-ai" }
  } catch (err) {
    captureError("[template-adapter] adaptation failed, falling back to local:", err)
    return localAdapt(template, name)
  }
}

export function artifactNamesToSuggestions(names: string[], template: MatchedTemplate): AiArtifactSuggestion[] {
  return template.artifactTypes.map((a, i) => ({ name: names[i] || a.name, type: a.type }))
}
