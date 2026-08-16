import type { EngineeringReport } from "./project-engineering"

export type ProjectReleaseDecision = {
  status: "ready" | "failed"
  errors: EngineeringReport["defects"]
  message: string | null
}

/** A project is releasable only after a clean, conclusive engineering verdict. */
export function decideProjectRelease(
  report: Pick<EngineeringReport, "verdict" | "defects">,
): ProjectReleaseDecision {
  const errors = report.defects.filter((defect) => defect.severity === "error")
  const verifiedClean = (report.verdict === "passed" || report.verdict === "repaired") && errors.length === 0

  if (verifiedClean) return { status: "ready", errors, message: null }

  const details = errors
    .slice(0, 3)
    .map((defect) => `${defect.file}: ${defect.message}`)
    .join("; ")
  const suffix = errors.length > 3 ? ` (and ${errors.length - 3} more)` : ""
  const reason = errors.length > 0
    ? `Engineering verification found ${errors.length} blocking error(s): ${details}${suffix}`
    : `Engineering verification did not pass (verdict: ${report.verdict})`

  return { status: "failed", errors, message: reason }
}
