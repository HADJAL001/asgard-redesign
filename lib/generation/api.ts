/* ================================================================
   OSGARD · Быстрый старт — API
   ----------------------------------------------------------------
   Тонкая обёртка над apiClient, по образцу lib/orchestrator/api.ts.
   Контракт см. backend/src/routes/generate-project.routes.ts:

   POST /generate-project        → 202 { taskId }
   GET  /task/:taskId            → TaskStatus
   GET  /task/:taskId/stream     → text/event-stream (см. hooks/useTaskStatus.ts)
   ================================================================ */

import { apiClient } from "@/lib/api-client"
import type { TaskStatus } from "./types"

export const generationApi = {
  createTask: async (name: string, description?: string) => {
    const { taskId } = await apiClient.post<{ taskId: string }>("/generate-project", { name, description })
    return taskId
  },

  getTask: (taskId: string) => apiClient.get<TaskStatus>(`/task/${taskId}`),
}
