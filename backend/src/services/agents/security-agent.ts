import { BaseAgent, generateReview, regenerateFile } from "./base-agent"
import type {
  GeneratedFile,
  ProjectSchema,
  SecurityAgentInput,
  SecurityFinding,
  SecurityReport,
  SecuritySeverity,
  VulnerabilityKind,
} from "./types"

/* ================================================================
   OSGARD · SecurityAgent
   ----------------------------------------------------------------
   Вход: все артефакты пайплайна (schema, frontend, backend, tests).
   Выход: SecurityReport — находки по SQLi/XSS/CSRF/авторизации/
   секретам, полученные ДВУМЯ независимыми путями:
   1. Детерминированный regex-скан (heuristicScan) — работает всегда,
      даже без AI, и не может дать ложноотрицательный результат по
      совести (проверяет только то, что реально нашёл в тексте).
   2. AI-обзор (deepReview) — контекстные находки, которые regex не
      ловит; получает список уже найденного эвристикой, чтобы не
      дублировать.
   До 3 самых серьёзных находок (сначала critical) патчатся реальной
   AI-перезаписью файла; остальные остаются рекомендациями.
   ================================================================ */

const MAX_AUTO_FIX = 3
const PREVIEW_CHARS = 800

interface HeuristicFinding {
  file: string
  vulnerability: VulnerabilityKind
  severity: SecuritySeverity
  description: string
  recommendation: string
}

function scanSqli(file: GeneratedFile): HeuristicFinding[] {
  const findings: HeuristicFinding[] = []
  file.content.split("\n").forEach((line, i) => {
    const hasSqlKeyword = /\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(line)
    const hasInterpolation = /`[^`]*\$\{[^}]*\}[^`]*`/.test(line) || /["'`]\s*\+\s*(req\.|body\.|params\.|query\.)/.test(line)
    if (hasSqlKeyword && hasInterpolation) {
      findings.push({
        file: file.path,
        vulnerability: "sqli",
        severity: "critical",
        description: `Похоже на SQL-инъекцию: пользовательский ввод интерполируется прямо в SQL-запрос (строка ${i + 1})`,
        recommendation: "Использовать параметризованные запросы db.prepare(sql).run(param) вместо конкатенации/интерполяции строк",
      })
    }
  })
  return findings
}

function scanXss(file: GeneratedFile): HeuristicFinding[] {
  const findings: HeuristicFinding[] = []
  if (/dangerouslySetInnerHTML/.test(file.content)) {
    findings.push({
      file: file.path,
      vulnerability: "xss",
      severity: "high",
      description: "Использование dangerouslySetInnerHTML — потенциальный XSS, если содержимое не санитизировано",
      recommendation: "Санитизировать HTML через DOMPurify перед вставкой либо отказаться от dangerouslySetInnerHTML",
    })
  }
  if (/\.innerHTML\s*=/.test(file.content)) {
    findings.push({
      file: file.path,
      vulnerability: "xss",
      severity: "high",
      description: "Прямое присваивание .innerHTML — потенциальный XSS",
      recommendation: "Использовать textContent или санитизацию перед вставкой HTML",
    })
  }
  return findings
}

function scanSecrets(file: GeneratedFile): HeuristicFinding[] {
  const match = file.content.match(/(api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-]{12,}["']/i)
  if (!match || /process\.env/.test(match[0])) return []
  return [
    {
      file: file.path,
      vulnerability: "secrets",
      severity: "critical",
      description: "Похоже на захардкоженный секрет/ключ в исходном коде",
      recommendation: "Вынести значение в переменную окружения (process.env.*) и не коммитить в репозиторий",
    },
  ]
}

function scanAuth(file: GeneratedFile, schema: ProjectSchema): HeuristicFinding[] {
  if (!schema.auth?.required || !/^routes\//.test(file.path) || file.path === "routes/auth.ts") return []
  const stateChanging = file.content.match(/router\.(post|put|delete|patch)\(/g) || []
  if (stateChanging.length === 0 || /requireAuth/.test(file.content)) return []
  return [
    {
      file: file.path,
      vulnerability: "auth",
      severity: "high",
      description: "Роут изменяет состояние (POST/PUT/DELETE/PATCH), но не защищён middleware авторизации",
      recommendation: "Добавить requireAuth middleware на все состояние-изменяющие роуты",
    },
  ]
}

function scanCsrf(file: GeneratedFile): HeuristicFinding[] {
  if (file.path !== "server.ts" || !/cookie/i.test(file.content) || /csrf/i.test(file.content)) return []
  return [
    {
      file: file.path,
      vulnerability: "csrf",
      severity: "medium",
      description: "Используются cookie, но не найдено CSRF-защиты (csurf/double-submit token)",
      recommendation: "Добавить CSRF-защиту (например csurf) для cookie-based авторизации либо перейти на Bearer JWT",
    },
  ]
}

function heuristicScan(input: SecurityAgentInput): HeuristicFinding[] {
  const files = [...input.backend.files, ...input.frontend.files]
  return files.flatMap((f) => [...scanSqli(f), ...scanXss(f), ...scanSecrets(f), ...scanAuth(f, input.schema), ...scanCsrf(f)])
}

function findFile(input: SecurityAgentInput, path: string): GeneratedFile | undefined {
  return [...input.backend.files, ...input.frontend.files].find((f) => f.path === path)
}

interface RawFinding {
  file?: string
  vulnerability?: string
  severity?: string
  description?: string
  recommendation?: string
}

const VALID_VULNS: VulnerabilityKind[] = ["sqli", "xss", "csrf", "auth", "secrets", "other"]
const VALID_SEVERITIES: SecuritySeverity[] = ["low", "medium", "high", "critical"]

function buildReviewPrompt(input: SecurityAgentInput, alreadyFound: HeuristicFinding[]): string {
  const files = [...input.backend.files, ...input.frontend.files].slice(0, 15)
  const listing = files
    .map((f) => `--- ${f.path} ---\n${f.content.slice(0, PREVIEW_CHARS)}${f.content.length > PREVIEW_CHARS ? "\n...(обрезано)" : ""}`)
    .join("\n\n")
  const already = alreadyFound.map((f) => `${f.file}: ${f.vulnerability}`).join(", ") || "нет"

  return `Ты — Инспектор безопасности в мультиагентном пайплайне генерации проектов OSGARD.
Проект "${input.schema.name}". Ниже — файлы проекта (могут быть обрезаны):

${listing}

Уже найдено эвристическим сканом (не дублируй): ${already}

Проверь на SQL-инъекции, XSS, CSRF, отсутствие авторизации на чувствительных роутах, захардкоженные секреты.

Верни СТРОГО валидный JSON (без markdown, без пояснений) вида:
{
  "findings": [
    {
      "file": "путь к файлу из списка выше",
      "vulnerability": "один из: sqli, xss, csrf, auth, secrets, other",
      "severity": "один из: low, medium, high, critical",
      "description": "конкретное описание уязвимости, 1 предложение",
      "recommendation": "конкретное исправление, 1 предложение"
    }
  ]
}
Если новых уязвимостей нет — верни {"findings": []}. Ответь только JSON.`
}

async function deepReview(input: SecurityAgentInput, heuristic: HeuristicFinding[]): Promise<SecurityFinding[] | null> {
  const review = await generateReview<{ findings?: RawFinding[] }>(buildReviewPrompt(input, heuristic), 3000, "security-agent")
  if (review === null) return null

  const raw = Array.isArray(review.findings) ? review.findings : []
  const seen = new Set(heuristic.map((f) => `${f.file}:${f.vulnerability}`))

  const findings: SecurityFinding[] = []
  for (const r of raw) {
    if (!r.file || !r.description || !r.recommendation || !findFile(input, r.file)) continue
    const vulnerability = VALID_VULNS.includes(r.vulnerability as VulnerabilityKind) ? (r.vulnerability as VulnerabilityKind) : "other"
    const key = `${r.file}:${vulnerability}`
    if (seen.has(key)) continue
    seen.add(key)

    findings.push({
      file: r.file,
      vulnerability,
      severity: VALID_SEVERITIES.includes(r.severity as SecuritySeverity) ? (r.severity as SecuritySeverity) : "medium",
      description: r.description,
      recommendation: r.recommendation,
      heuristic: false,
      fixed: false,
    })
  }
  return findings
}

function buildFixPrompt(file: GeneratedFile, finding: SecurityFinding): string {
  return `Ты исправляешь уязвимость безопасности в файле "${file.path}" проекта OSGARD.

Текущее содержимое:
\`\`\`
${file.content}
\`\`\`

Уязвимость (${finding.vulnerability}, severity: ${finding.severity}): ${finding.description}
Рекомендация: ${finding.recommendation}

Требования:
- Исправь ТОЛЬКО описанную уязвимость, не меняй остальную логику файла без необходимости.
- Не убирай существующую функциональность.
- Верни ТОЛЬКО полное новое содержимое файла в одном \`\`\` блоке, без пояснений.`
}

const SEVERITY_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export class SecurityAgent extends BaseAgent<SecurityAgentInput, SecurityReport> {
  readonly name = "security"

  async execute(input: SecurityAgentInput): Promise<SecurityReport> {
    const heuristicRaw = heuristicScan(input)
    const heuristicFindings: SecurityFinding[] = heuristicRaw.map((f) => ({ ...f, heuristic: true, fixed: false }))

    const aiFindings = await deepReview(input, heuristicRaw)
    const source: "ai" | "fallback" = aiFindings !== null ? "ai" : "fallback"

    const allFindings = [...heuristicFindings, ...(aiFindings ?? [])].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
    )

    /* Патчи применяются ПАРАЛЛЕЛЬНО (Promise.all), а не по одному: каждый
       нацелен на свой независимый файл, общих данных между вызовами нет — тот
       же приём, что и в optimizer-agent.ts/generateFilesFromManifest. Кандидаты
       (до MAX_AUTO_FIX штук, по убыванию severity — allFindings уже отсортирован)
       отбираются заранее, а не по ходу цикла с уменьшением бюджета по факту
       успеха каждого патча. */
    const fixCandidates = source === "ai" ? allFindings.filter((f) => findFile(input, f.file)).slice(0, MAX_AUTO_FIX) : []

    const patches = await Promise.all(
      fixCandidates.map(async (finding) => {
        const sourceFile = findFile(input, finding.file)!
        const patched = await regenerateFile(buildFixPrompt(sourceFile, finding), 6000, "security-agent-fix")
        return { finding, patched }
      }),
    )

    const files: GeneratedFile[] = []
    for (const { finding, patched } of patches) {
      if (patched) {
        finding.fixed = true
        files.push({ path: finding.file, content: patched })
      }
    }

    return { type: "security", files, findings: allFindings, source }
  }
}
