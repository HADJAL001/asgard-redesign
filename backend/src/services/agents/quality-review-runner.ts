import type {
  OptimizedArtifact,
  OptimizerAgentInput,
  SecurityReport,
} from "./types"

export interface QualityReviewers {
  optimizer: { run(input: OptimizerAgentInput, taskId?: string): Promise<OptimizedArtifact> }
  security: { run(input: OptimizerAgentInput, taskId?: string): Promise<SecurityReport> }
}

/** Optimizer and Security inspect the same immutable build output and do not depend on each other. */
export function runIndependentQualityReviews(
  input: OptimizerAgentInput,
  taskId: string | undefined,
  reviewers: QualityReviewers,
): Promise<[OptimizedArtifact, SecurityReport]> {
  return Promise.all([
    reviewers.optimizer.run(input, taskId),
    reviewers.security.run(input, taskId),
  ])
}
