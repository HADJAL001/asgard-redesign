/* ================================================================
   OSGARD · Service Bridge (Интеграции) API
   ----------------------------------------------------------------
   Тонкая обёртка над apiClient. Контракт см.
   backend/src/routes/service-bridge.routes.ts:

   GET    /integrations/connectors        → { connectors: ConnectorPublic[] }
   GET    /integrations                   → { integrations: Integration[] }
   GET    /integrations/meta/remaining    → IntegrationsQuota
   GET    /integrations/:id               → { integration: Integration }
   POST   /integrations                   → { integration: Integration }
   PATCH  /integrations/:id               → { integration: Integration }
   DELETE /integrations/:id               → { success: true }
   POST   /integrations/:id/test          → { result: ActionResult }
   POST   /integrations/:id/execute       → { result: ActionResult }
   GET    /integrations/:id/logs          → { logs: IntegrationLog[] }
   GET    /integrations/:id/code          → { code: string, actionId: string }
   ================================================================ */

import { apiClient } from "@/lib/api-client"
import type {
  ActionResult,
  ConnectorPublic,
  CreateIntegrationInput,
  Integration,
  IntegrationLog,
  IntegrationsQuota,
  UpdateIntegrationInput,
} from "./types"

export const integrationsApi = {
  getConnectors: async () => {
    const { connectors } = await apiClient.get<{ connectors: ConnectorPublic[] }>("/integrations/connectors")
    return connectors
  },

  getIntegrations: async () => {
    const { integrations } = await apiClient.get<{ integrations: Integration[] }>("/integrations")
    return integrations
  },

  getIntegration: async (id: number) => {
    const { integration } = await apiClient.get<{ integration: Integration }>(`/integrations/${id}`)
    return integration
  },

  createIntegration: async (input: CreateIntegrationInput) => {
    const { integration } = await apiClient.post<{ integration: Integration }>("/integrations", input)
    return integration
  },

  updateIntegration: async (id: number, input: UpdateIntegrationInput) => {
    const { integration } = await apiClient.patch<{ integration: Integration }>(`/integrations/${id}`, input)
    return integration
  },

  deleteIntegration: (id: number) => apiClient.delete<{ success: boolean }>(`/integrations/${id}`),

  testIntegration: async (id: number) => {
    const { result } = await apiClient.post<{ result: ActionResult }>(`/integrations/${id}/test`, {})
    return result
  },

  executeIntegration: async (id: number, actionId: string, params: Record<string, unknown>) => {
    const { result } = await apiClient.post<{ result: ActionResult }>(`/integrations/${id}/execute`, { actionId, params })
    return result
  },

  getLogs: async (id: number, limit?: number) => {
    const query = limit ? `?limit=${limit}` : ""
    const { logs } = await apiClient.get<{ logs: IntegrationLog[] }>(`/integrations/${id}/logs${query}`)
    return logs
  },

  getCode: async (id: number, actionId?: string) => {
    const query = actionId ? `?actionId=${encodeURIComponent(actionId)}` : ""
    return apiClient.get<{ code: string; actionId: string }>(`/integrations/${id}/code${query}`)
  },

  getRemainingQuota: () => apiClient.get<IntegrationsQuota>("/integrations/meta/remaining"),
}
