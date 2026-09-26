import fs from "node:fs/promises"

const file = process.argv[2]
if (!file) throw new Error("Usage: node scripts/validate-competitor-benchmark.mjs <results.json>")
const manifest = JSON.parse(await fs.readFile(new URL("../docs/golden-tasks-v1.json", import.meta.url), "utf8"))
const results = JSON.parse(await fs.readFile(file, "utf8"))
const taskIds = new Set(manifest.tasks.map((task) => task.id))
const metrics = new Set(manifest.metrics)
if (!results || typeof results !== "object" || !Array.isArray(results.runs)) throw new Error("results.runs must be an array")

for (const run of results.runs) {
  if (!taskIds.has(run?.taskId)) throw new Error(`unknown task: ${run?.taskId}`)
  if (typeof run.provider !== "string" || !run.provider.trim()) throw new Error("provider is required")
  if (typeof run.evidenceUrl !== "string" || !/^https?:\/\//.test(run.evidenceUrl)) throw new Error(`${run.provider}: evidenceUrl is required`)
  if (Number.isNaN(Date.parse(run.capturedAt || ""))) throw new Error(`${run.provider}: capturedAt must be ISO date`)
  if (!run.metrics || typeof run.metrics !== "object") throw new Error(`${run.provider}: metrics are required`)
  for (const [metric, value] of Object.entries(run.metrics)) {
    if (!metrics.has(metric)) throw new Error(`${run.provider}: unsupported metric ${metric}`)
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${run.provider}: ${metric} must be a non-negative number`)
  }
  for (const required of ["firstPreviewMs", "workflowMs", "taskSuccess", "axeViolations", "evidenceCoverage"]) {
    if (!(required in run.metrics)) throw new Error(`${run.provider}: missing ${required}`)
  }
}

console.log(JSON.stringify({ valid: true, manifestVersion: manifest.version, runs: results.runs.length, providers: [...new Set(results.runs.map((run) => run.provider))] }, null, 2))
