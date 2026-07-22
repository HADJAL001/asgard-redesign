/* ================================================================
   OSGARD · Agent Pipeline — общие контракты
   ----------------------------------------------------------------
   Артефакты, которыми обмениваются агенты пайплайна генерации
   проекта. ProjectSchema и FrontendArtifact описывают выход агентов
   Аналитика/Архитектора/Дизайнера/Фронтенда (соседний пайплайн);
   Backend/Tester/Optimizer/Security — выход агентов из этого модуля.
   ================================================================ */

export interface SchemaField {
  name: string
  type: string
  required?: boolean
  unique?: boolean
}

export interface SchemaEntity {
  name: string
  fields: SchemaField[]
}

export interface ProjectSchema {
  name: string
  description: string
  entities: SchemaEntity[]
  auth?: {
    required: boolean
    roles?: string[]
  }
}

export interface GeneratedFile {
  path: string
  content: string
}

export interface FrontendArtifact {
  type: "frontend"
  files: GeneratedFile[]
}

export interface BackendArtifact {
  type: "backend"
  files: GeneratedFile[]
  source: "ai" | "fallback"
}

export interface TestArtifact {
  type: "tests"
  files: GeneratedFile[]
  source: "ai" | "fallback"
}

export type OptimizationCategory =
  | "memoization"
  | "lazy-loading"
  | "compression"
  | "bundle-size"
  | "query"
  | "caching"
  | "other"

export interface OptimizationSuggestion {
  file: string
  issue: string
  suggestion: string
  category: OptimizationCategory
  /** true, если предложение было применено автоматически (файл переписан в OptimizedArtifact.files). */
  applied: boolean
}

export interface OptimizedArtifact {
  type: "optimized"
  /** Только файлы, реально переписанные по applied-предложениям (не полный проект). */
  files: GeneratedFile[]
  suggestions: OptimizationSuggestion[]
  source: "ai" | "fallback"
}

export type VulnerabilityKind = "sqli" | "xss" | "csrf" | "auth" | "secrets" | "other"
export type SecuritySeverity = "low" | "medium" | "high" | "critical"

export interface SecurityFinding {
  file: string
  vulnerability: VulnerabilityKind
  severity: SecuritySeverity
  description: string
  recommendation: string
  /** true, если найдено детерминированным regex-сканом (а не только AI-обзором). */
  heuristic: boolean
  /** true, если файл был переписан с исправлением (patched-версия в SecurityReport.files). */
  fixed: boolean
}

export interface SecurityReport {
  type: "security"
  /** Только патченные версии файлов (fixed=true находки), не полный проект. */
  files: GeneratedFile[]
  findings: SecurityFinding[]
  source: "ai" | "fallback"
}

export interface DeployAgentInput {
  files: GeneratedFile[]
  projectName: string
}

export interface DeployArtifact {
  type: "deployed"
  appUrl: string | null
  repoUrl: string | null
  dockerfile?: string
  /** "fallback" — нет токена/сетевая ошибка на любом из шагов (appUrl и/или repoUrl уйдут в null),
   *  а не выдуманный URL: вызывающий код не должен путать это с успешным деплоем. */
  source: "live" | "fallback"
}

export type AgentArtifact = BackendArtifact | TestArtifact | OptimizedArtifact | SecurityReport | DeployArtifact

export interface BackendAgentInput {
  schema: ProjectSchema
  frontend: FrontendArtifact
}

export interface TesterAgentInput {
  frontend: FrontendArtifact
  backend: BackendArtifact
}

export interface OptimizerAgentInput {
  schema: ProjectSchema
  frontend: FrontendArtifact
  backend: BackendArtifact
  tests: TestArtifact
}

export interface SecurityAgentInput {
  schema: ProjectSchema
  frontend: FrontendArtifact
  backend: BackendArtifact
  tests: TestArtifact
}
