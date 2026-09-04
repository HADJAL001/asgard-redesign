"use client"

import { ApiError, apiClient } from "@/lib/api-client"

export type GeneratedProject = {
  id: number
}

export type ProjectGenerationResult = {
  success: boolean
  project?: GeneratedProject
  error?: string
  unclearRequest?: boolean
  received?: string
}

type GenerateResponse = {
  project: GeneratedProject
}

function generationError(err: unknown) {
  if (err instanceof ApiError) return err.message
  return "Не удалось создать проект"
}

/**
 * Minimal public entry point for the landing page. The full project store is
 * intentionally not needed until the person enters their workspace.
 */
export async function generateProjectFromIdea(idea: string): Promise<ProjectGenerationResult> {
  try {
    const response = await apiClient.post<GenerateResponse>("/projects/generate", {
      name: undefined,
      hint: idea,
    })
    return { success: true, project: response.project }
  } catch (err) {
    const unclearRequest = err instanceof ApiError && err.data?.code === "unclear_request"
    const received =
      err instanceof ApiError && typeof err.data?.received === "string"
        ? err.data.received
        : undefined
    return {
      success: false,
      error: generationError(err),
      unclearRequest,
      received,
    }
  }
}
