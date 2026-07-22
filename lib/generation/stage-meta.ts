import type { ArtifactType } from "./types"

/* ================================================================
   OSGARD · Быстрый старт — метаданные стадий пайплайна
   ----------------------------------------------------------------
   Порядок и состав зеркалит DEFAULT_PIPELINE
   (backend/src/services/pipeline-agents.ts). При замене заглушек
   на createRealPipeline() состав стадий не меняется — обновлять
   этот список нужно только при изменении самого DEFAULT_PIPELINE.
   ================================================================ */

export interface PipelineStageMeta {
  type: ArtifactType
  labelKey: string
}

export const PIPELINE_STAGES: PipelineStageMeta[] = [
  { type: "spec", labelKey: "quickStart.stage.spec" },
  { type: "schema", labelKey: "quickStart.stage.schema" },
  { type: "design", labelKey: "quickStart.stage.design" },
  { type: "frontend", labelKey: "quickStart.stage.frontend" },
  { type: "backend", labelKey: "quickStart.stage.backend" },
  { type: "tests", labelKey: "quickStart.stage.tests" },
  { type: "optimized", labelKey: "quickStart.stage.optimized" },
  { type: "security", labelKey: "quickStart.stage.security" },
]
