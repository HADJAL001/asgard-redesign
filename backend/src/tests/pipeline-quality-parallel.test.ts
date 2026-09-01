import test from "node:test"
import assert from "node:assert/strict"
import { runIndependentQualityReviews } from "../services/agents/quality-review-runner"
import type {
  OptimizedArtifact,
  OptimizerAgentInput,
  SecurityReport,
} from "../services/agents/types"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test("quality reviews start together and preserve optimizer/security result order", async () => {
  const optimizer = deferred<OptimizedArtifact>()
  const security = deferred<SecurityReport>()
  const started: string[] = []

  const pending = runIndependentQualityReviews({} as OptimizerAgentInput, "task-42", {
    optimizer: {
      run: async (_input, taskId) => {
        started.push(`optimizer:${taskId}`)
        return optimizer.promise
      },
    },
    security: {
      run: async (_input, taskId) => {
        started.push(`security:${taskId}`)
        return security.promise
      },
    },
  })

  assert.deepEqual(started, ["optimizer:task-42", "security:task-42"])

  const securityResult: SecurityReport = { type: "security", files: [], findings: [], source: "fallback" }
  const optimizerResult: OptimizedArtifact = { type: "optimized", files: [], suggestions: [], source: "fallback" }
  security.resolve(securityResult)
  optimizer.resolve(optimizerResult)

  assert.deepEqual(await pending, [optimizerResult, securityResult])
})
