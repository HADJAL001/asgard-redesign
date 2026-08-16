import { test } from "node:test"
import assert from "node:assert/strict"
import {
  emitGenerationStage,
  generationEvents,
  getRecentStages,
  type GenerationStageEvent,
} from "../lib/generation-events"

test("терминальное SSE-событие сохраняет признак компенсации", () => {
  const projectId = 991_001
  let received: GenerationStageEvent | undefined
  generationEvents.once(`gen:${projectId}`, (event) => {
    received = event as GenerationStageEvent
  })

  emitGenerationStage({
    projectId,
    stage: "failed",
    label: "Ошибка генерации",
    progress: 1,
    makegood: true,
  })

  assert.equal(received?.makegood, true)
  assert.equal(getRecentStages(projectId).at(-1)?.makegood, true)
})
