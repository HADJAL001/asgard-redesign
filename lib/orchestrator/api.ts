/* ================================================================
   OSGARD · Orchestrator API
   ----------------------------------------------------------------
   Тонкая обёртка над apiClient для модуля «AI-оркестратор».
   Контракт см. backend/src/routes/orchestrator.routes.ts:

   GET    /orchestrator/chains                 → { chains: OrchestratorChain[] }
   POST   /orchestrator/chains                 → { chain: OrchestratorChain }
   GET    /orchestrator/chains/:id              → { chain: OrchestratorChain }
   PUT    /orchestrator/chains/:id              → { chain: OrchestratorChain }  (full-replace)
   DELETE /orchestrator/chains/:id              → { success: true }
   POST   /orchestrator/chains/:id/run          → { executionId, cost }
   GET    /orchestrator/executions/:id          → { execution: OrchestratorExecution }
   GET    /orchestrator/stream/:executionId     → text/event-stream (см. hooks/useOrchestratorRun.ts)
   GET    /orchestrator/remaining               → { remaining: number, total: number }
   GET    /orchestrator/chains/:id/webhook-trigger/:nodeId    → { trigger: OrchestratorWebhookTrigger | null }
   POST   /orchestrator/chains/:id/webhook-trigger/:nodeId    → { trigger: OrchestratorWebhookTrigger }
   DELETE /orchestrator/chains/:id/webhook-trigger/:nodeId    → { success: true }
   ================================================================ */

import { apiClient } from "@/lib/api-client"
import type { CreateOrUpdateChainInput, OrchestratorChain, OrchestratorExecution, OrchestratorWebhookTrigger, RunChainResult } from "./types"

export const orchestratorApi = {
  getChains: async () => {
    const { chains } = await apiClient.get<{ chains: OrchestratorChain[] }>("/orchestrator/chains")
    return chains
  },

  getChain: async (id: number) => {
    const { chain } = await apiClient.get<{ chain: OrchestratorChain }>(`/orchestrator/chains/${id}`)
    return chain
  },

  createChain: async (input: CreateOrUpdateChainInput) => {
    const { chain } = await apiClient.post<{ chain: OrchestratorChain }>("/orchestrator/chains", input)
    return chain
  },

  updateChain: async (id: number, input: CreateOrUpdateChainInput) => {
    const { chain } = await apiClient.put<{ chain: OrchestratorChain }>(`/orchestrator/chains/${id}`, input)
    return chain
  },

  deleteChain: (id: number) => apiClient.delete<{ success: boolean }>(`/orchestrator/chains/${id}`),

  runChain: (id: number, input: string) =>
    apiClient.post<RunChainResult>(`/orchestrator/chains/${id}/run`, { input }),

  getExecution: async (id: number) => {
    const { execution } = await apiClient.get<{ execution: OrchestratorExecution }>(`/orchestrator/executions/${id}`)
    return execution
  },

  getRemainingQuota: async () => {
    const data = await apiClient.get<{ remaining: number; total: number }>("/orchestrator/remaining")
    return data
  },

  saveAsJarvisTemplate: async (id: number) => {
    const { chain } = await apiClient.post<{ chain: OrchestratorChain }>(`/orchestrator/chains/${id}/jarvis-template`, {})
    return chain
  },

  removeJarvisTemplate: async (id: number) => {
    await apiClient.delete<{ success: boolean }>(`/orchestrator/chains/${id}/jarvis-template`)
  },

  getWebhookTrigger: async (chainId: number, nodeId: string) => {
    const { trigger } = await apiClient.get<{ trigger: OrchestratorWebhookTrigger | null }>(
      `/orchestrator/chains/${chainId}/webhook-trigger/${nodeId}`,
    )
    return trigger
  },

  createOrRegenerateWebhookTrigger: async (chainId: number, nodeId: string) => {
    const { trigger } = await apiClient.post<{ trigger: OrchestratorWebhookTrigger }>(
      `/orchestrator/chains/${chainId}/webhook-trigger/${nodeId}`,
      {},
    )
    return trigger
  },

  deleteWebhookTrigger: (chainId: number, nodeId: string) =>
    apiClient.delete<{ success: boolean }>(`/orchestrator/chains/${chainId}/webhook-trigger/${nodeId}`),
}
