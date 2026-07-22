/* ================================================================
   OSGARD · Быстрый старт — клиентские типы
   ----------------------------------------------------------------
   Зеркало backend/src/types/pipeline.types.ts. `timestamp` здесь —
   string (ISO), т.к. на проводе Date сериализуется в JSON-строку.
   GenerationStreamEvent — по образцу lib/orchestrator/types.ts
   (OrchestratorStreamEvent), события реально эмитируемые
   GET /api/task/:taskId/stream — см. generate-project.routes.ts.
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
  timestamp: string
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

export type GenerationStreamEvent =
  | { type: "task_start"; taskId: string }
  | { type: "step_start"; step: string }
  | { type: "step_done"; step: string; artifact: Artifact }
  | { type: "task_done"; result: any }
  | { type: "task_error"; error: string }
  | { type: "task_cancelled" }
