import { BaseAgent } from "./base-agent"
import { deployToVercel } from "../integrations/vercel"
import { createGitHubRepo } from "../integrations/github"
import { generateDockerfile } from "../integrations/docker"
import { captureError } from "../../lib/sentry"
import { verifyBuildInSandbox } from "../sandbox.service"
import type { DeployAgentInput, DeployArtifact, GeneratedFile } from "./types"

/* ================================================================
   OSGARD · DeployAgent
   ----------------------------------------------------------------
   Финальный шаг пайплайна (pipeline-bridge.ts) — публикует собранный
   проект на Vercel и GitHub через готовые адаптеры (services/integrations).
   В отличие от Backend/Tester/Optimizer/Security (которые деградируют
   на детерминированный AI-fallback), здесь "деградация" — это
   отсутствие токена или сетевая ошибка на одном из шагов: appUrl/repoUrl
   уходят в null, а не в фейковый placeholder-URL, чтобы вызывающий код
   не принял недеплой за успех (source: "live" | "fallback" — тот же
   сигнал деградации по смыслу, что source: "ai" | "fallback" у
   остальных агентов этого модуля).
   ================================================================ */

function hasNextConfig(files: GeneratedFile[]): boolean {
  return files.some((f) => f.path === "next.config.js" || f.path === "next.config.ts" || f.path === "next.config.mjs")
}

/** Если в дереве уже есть Dockerfile — используем его. Иначе генерируем
 *  детерминированно (без AI) только когда проект похож на Node-приложение. */
function ensureDockerfile(files: GeneratedFile[], projectName: string): { files: GeneratedFile[]; dockerfile?: string } {
  const existing = files.find((f) => f.path === "Dockerfile")
  if (existing) return { files, dockerfile: existing.content }

  if (!files.some((f) => f.path === "package.json")) return { files }

  const dockerfile = generateDockerfile({ name: projectName, framework: hasNextConfig(files) ? "nextjs" : "react" })
  return { files: [...files, { path: "Dockerfile", content: dockerfile }], dockerfile }
}

export class DeployAgent extends BaseAgent<DeployAgentInput, DeployArtifact> {
  readonly name = "deploy"

  async execute(input: DeployAgentInput): Promise<DeployArtifact> {
    if (input.files.length === 0) {
      return { type: "deployed", appUrl: null, repoUrl: null, source: "fallback" }
    }

    const { files, dockerfile } = ensureDockerfile(input.files, input.projectName)

    const sandbox = await verifyBuildInSandbox(files, { profile: "fullstack", logLabel: `generated-${input.projectName}` })
    const sandboxStatus = sandbox.skipped ? "unavailable" as const : sandbox.timedOut ? "timeout" as const : sandbox.ok ? "passed" as const : "failed" as const
    const rawLog = sandbox.logs.replace(/[\r\n\t]+/g, " ")
    const logTail = rawLog.replace(/(api[_-]?key|token|secret|password)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]").slice(-800)
    const sandboxProvenance = { status: sandboxStatus, exitCode: sandbox.skipped ? null : sandbox.ok ? 0 : 1, timedOut: sandbox.timedOut, durationMs: sandbox.durationMs, ...(logTail ? { logTail } : {}) }
    if (sandboxStatus !== "passed") {
      return { type: "deployed", appUrl: null, repoUrl: null, dockerfile, source: "fallback", sandbox: sandboxProvenance }
    }

    const [appUrl, repoUrl] = await Promise.all([
      deployToVercel(files, input.projectName).catch((err) => {
        captureError("[deploy-agent] Vercel deploy failed:", err)
        return null
      }),
      createGitHubRepo(files, input.projectName).catch((err) => {
        captureError("[deploy-agent] GitHub repo creation failed:", err)
        return null
      }),
    ])

    return {
      type: "deployed",
      appUrl,
      repoUrl,
      dockerfile,
      source: appUrl && repoUrl ? "live" : "fallback",
      sandbox: sandboxProvenance,
    }
  }
}
