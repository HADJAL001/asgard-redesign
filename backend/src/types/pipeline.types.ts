/* ================================================================
   OSGARD · Пайплайн генерации проекта — общий контракт
   ----------------------------------------------------------------
   Используется ChainManager (chain-manager.ts) и агентами, которые
   реализуют другие модули (Аналитик/Архитектор/Дизайнер/Фронтенд/
   Бэкенд/Тестировщик/Оптимизатор/Безопасник/интеграции деплоя).
   Каждый агент — класс с execute(input, context): Promise<any>.
   ================================================================ */

export type ArtifactType =
  | "spec"
  | "schema"
  | "design"
  | "frontend"
  | "backend"
  | "tests"
  | "optimized"
  | "security"
  | "deployed"

export interface Artifact {
  id: string
  type: ArtifactType
  content: any
  timestamp: Date
}

export type TaskStatusState = "queued" | "processing" | "completed" | "failed" | "cancelled"

export interface TaskStatus {
  taskId: string
  userId: string
  status: TaskStatusState
  progress: number
  currentStep: string
  artifacts: Artifact[]
  result?: {
    appUrl: string
    repoUrl: string
    previewUrl?: string
  }
  error?: string
}

export interface AgentContext {
  taskId: string
  userId: number
  artifacts: Artifact[]
}

export interface Agent {
  readonly type: ArtifactType
  execute(input: any, context: AgentContext): Promise<any>
}
