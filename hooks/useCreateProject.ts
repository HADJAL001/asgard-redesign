"use client"

/* ================================================================
   OSGARD · useCreateProject
   ----------------------------------------------------------------
   useState-мутация запуска генерации проекта (POST /api/generate-project),
   по образцу handleSubmit в components/project-create-wizard.tsx —
   без react-query, т.к. в репозитории его нет.
   ================================================================ */

import { useState } from "react"
import { generationApi } from "@/lib/generation/api"
import { ApiError } from "@/lib/api-client"

export function useCreateProject() {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function createProject(name: string, description?: string): Promise<string | null> {
    setError(null)
    setSubmitting(true)
    try {
      return await generationApi.createTask(name, description)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось запустить генерацию")
      return null
    } finally {
      setSubmitting(false)
    }
  }

  return { createProject, submitting, error }
}
