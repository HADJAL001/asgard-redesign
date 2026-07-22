import { createHash } from "node:crypto"
import { withRetry } from "../../utils/retry"
import { captureError } from "../../lib/sentry"
import { cacheService } from "../cache.service"
import { logIntegrationEvent } from "./logger"
import type { FileTree } from "../../types/file-tree"

/* ================================================================
   OSGARD · Vercel Deploy Adapter
   ----------------------------------------------------------------
   Деплоит файловое дерево сгенерированного приложения на Vercel через
   REST API (без CLI). Единый серверный VERCEL_TOKEN (аналог
   NETLIFY_AUTH_TOKEN в netlify-deploy.ts) — не пер-пользовательский.

   Пример вызова:
     const url = await deployToVercel(files, "my-generated-app")
     // -> "https://my-generated-app-abc123.vercel.app"
   ================================================================ */

const VERCEL_API = "https://api.vercel.com"
const READY_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 3000

export function isVercelConfigured(): boolean {
  return !!process.env.VERCEL_TOKEN
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
    "content-type": "application/json",
  }
}

function withTeamQuery(url: string): string {
  const teamId = process.env.VERCEL_TEAM_ID
  return teamId ? `${url}${url.includes("?") ? "&" : "?"}teamId=${teamId}` : url
}

type VercelDeployment = { id: string; url: string; readyState: string }

async function pollUntilReady(deploymentId: string): Promise<VercelDeployment> {
  const start = Date.now()

  while (Date.now() - start < READY_TIMEOUT_MS) {
    const res = await fetch(withTeamQuery(`${VERCEL_API}/v13/deployments/${deploymentId}`), {
      headers: authHeaders(),
    })

    if (res.ok) {
      const data = (await res.json()) as VercelDeployment
      if (data.readyState === "READY") return data
      if (data.readyState === "ERROR" || data.readyState === "CANCELED") {
        throw new Error(`Деплой на Vercel завершился со статусом ${data.readyState}`)
      }
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error("Превышено время ожидания готовности деплоя на Vercel")
}

function hashFiles(files: FileTree): string {
  const hash = createHash("sha256")
  for (const f of files) {
    hash.update(f.path).update("\0").update(f.content).update("\0")
  }
  return hash.digest("hex")
}

export type DeployToVercelOptions = {
  /** Пропустить кеш и задеплоить заново, даже если этот же набор файлов уже деплоился. */
  force?: boolean
  /** TTL кеша готового URL в секундах (по умолчанию 1 час). */
  cacheTtlSeconds?: number
}

/** Деплоит файлы как production-деплой на Vercel и возвращает публичный URL.
 *  Результат кешируется по хешу содержимого files (cache.service.ts — Redis
 *  при наличии REDIS_URL, иначе in-memory), чтобы повторный вызов с теми же
 *  файлами не создавал новый деплой. Никогда не удаляет предыдущие деплои —
 *  Vercel сам версионирует их по проекту. */
export async function deployToVercel(
  files: FileTree,
  projectName: string,
  options: DeployToVercelOptions = {},
): Promise<string> {
  if (!isVercelConfigured()) {
    throw new Error("VERCEL_TOKEN не сконфигурирован на сервере")
  }
  if (files.length === 0) {
    throw new Error("Нет файлов для деплоя")
  }

  const cacheKey = `vercel:deploy:${projectName}:${hashFiles(files)}`
  if (!options.force) {
    const cached = await cacheService.get(cacheKey)
    if (cached) return cached as string
  }

  const startedAt = Date.now()

  try {
    const created = await withRetry(async () => {
      const res = await fetch(withTeamQuery(`${VERCEL_API}/v13/deployments`), {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          name: projectName,
          target: "production",
          projectSettings: { framework: "nextjs" },
          files: files.map((f) => ({ file: f.path, data: f.content })),
        }),
      })

      if (!res.ok) {
        const errText = await res.text().catch(() => "")
        throw new Error(`Не удалось создать деплой на Vercel: ${res.status} ${errText}`)
      }

      return (await res.json()) as VercelDeployment
    })

    const ready = await pollUntilReady(created.id)
    const url = `https://${ready.url}`

    await cacheService.set(cacheKey, url, options.cacheTtlSeconds ?? 3600)
    logIntegrationEvent("vercel", true, Date.now() - startedAt)
    return url
  } catch (err) {
    logIntegrationEvent("vercel", false, Date.now() - startedAt, err)
    throw err
  }
}
