import { BaseAgent } from "./base-agent"
import { deployToVercel } from "../integrations/vercel"
import { createGitHubRepo } from "../integrations/github"
import { generateDockerfile } from "../integrations/docker"
import { captureError } from "../../lib/sentry"
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
    }
  }
}
