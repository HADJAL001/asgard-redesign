"use client"

/* ================================================================
   OSGARD · orchestratorStore
   ----------------------------------------------------------------
   Zustand-стор модуля «AI-оркестратор» («Python Snake»): список
   цепочек, редактируемая цепочка, состояние текущего запуска.
   Живое обновление execution (прогресс/статусы узлов) приходит из
   hooks/useOrchestratorRun.ts (SSE) — синхронизируется в стор через
   setRunState(), чтобы прогресс был виден и вне OrchestratorEditor
   (например, в навбаре).
   ================================================================ */

import { create } from "zustand"
import { orchestratorApi } from "@/lib/orchestrator/api"
import { ApiError } from "@/lib/api-client"
import type { CreateOrUpdateChainInput, OrchestratorChain, RunChainResult } from "@/lib/orchestrator/types"
import type { OrchestratorRunState } from "@/hooks/useOrchestratorRun"

const IDLE_RUN_STATE: OrchestratorRunState = { status: "idle", nodes: [], progress: 0 }

interface OrchestratorStoreState {
  chains: OrchestratorChain[]
  chainsLoading: boolean
  chainsError: string | null

  currentChain: OrchestratorChain | null

  executionId: number | null
  executionCost: number | null
  runState: OrchestratorRunState

  loadChains: () => Promise<void>
  loadChain: (id: number) => Promise<OrchestratorChain>
  createChain: (input: CreateOrUpdateChainInput) => Promise<OrchestratorChain>
  updateChain: (id: number, input: CreateOrUpdateChainInput) => Promise<OrchestratorChain>
  deleteChain: (id: number) => Promise<void>
  setCurrentChain: (chain: OrchestratorChain | null) => void

  runChain: (id: number, input: string) => Promise<RunChainResult>
  setRunState: (state: OrchestratorRunState) => void
  resetRun: () => void
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback
}

export const useOrchestratorStore = create<OrchestratorStoreState>((set, get) => ({
  chains: [],
  chainsLoading: false,
  chainsError: null,

  currentChain: null,

  executionId: null,
  executionCost: null,
  runState: IDLE_RUN_STATE,

  loadChains: async () => {
    set({ chainsLoading: true, chainsError: null })
    try {
      const chains = await orchestratorApi.getChains()
      set({ chains, chainsLoading: false })
    } catch (err) {
      set({ chainsError: errorMessage(err, "Не удалось загрузить цепочки"), chainsLoading: false })
    }
  },

  loadChain: async (id) => {
    const chain = await orchestratorApi.getChain(id)
    set({ currentChain: chain })
    return chain
  },

  createChain: async (input) => {
    const chain = await orchestratorApi.createChain(input)
    set((state) => ({ chains: [chain, ...state.chains], currentChain: chain }))
    return chain
  },

  updateChain: async (id, input) => {
    const chain = await orchestratorApi.updateChain(id, input)
    set((state) => ({
      chains: state.chains.map((c) => (c.id === id ? chain : c)),
      currentChain: chain,
    }))
    return chain
  },

  deleteChain: async (id) => {
    await orchestratorApi.deleteChain(id)
    set((state) => ({
      chains: state.chains.filter((c) => c.id !== id),
      currentChain: state.currentChain?.id === id ? null : state.currentChain,
    }))
  },

  setCurrentChain: (chain) => set({ currentChain: chain }),

  runChain: async (id, input) => {
    set({ executionId: null, executionCost: null, runState: { ...IDLE_RUN_STATE, status: "running" } })
    const result = await orchestratorApi.runChain(id, input)
    set({ executionId: result.executionId, executionCost: result.cost })
    return result
  },

  setRunState: (runState) => set({ runState }),

  resetRun: () => set({ executionId: null, executionCost: null, runState: IDLE_RUN_STATE }),
}))
