import { isNetlifyConfigured, runNetlifyDeployJob } from "./netlify-deploy"
import {
  isOwnClusterConfigured,
  missingOwnClusterEnvKeys,
  runOwnClusterDeployJob,
} from "./own-cluster-deploy"

/* ================================================================
   OSGARD · Выбор площадки публикации
   ----------------------------------------------------------------
   Продукт платформы — аренда НАШЕЙ инфраструктуры. Значит приложение,
   созданное движком, по умолчанию обязано публиковаться на наши
   сервера (*.osgard.cloud), и только при их недоступности — на чужую
   площадку, и то лишь если оператор это явно разрешил.

   Порядок выбора:
     1) своя инфраструктура — если сконфигурирована (own-cluster-deploy);
     2) Netlify — ТОЛЬКО при DEPLOY_ALLOW_NETLIFY_FALLBACK=true;
     3) отказ с объяснением, чего именно не хватает.

   Раньше здесь не было выбора вообще: единственный провайдер был
   Netlify, из-за чего платформа продавала аренду инфраструктуры,
   а приложения клиентов уезжали к конкуренту.
   ================================================================ */

export type DeployTarget = "own-cluster" | "netlify" | "none"

export interface DeployTargetDecision {
  target: DeployTarget
  /** Человеческое объяснение выбора — уходит в ответ API, видно в UI. */
  reason: string
  /** Понятное имя площадки для интерфейса. */
  label: string
}

/** true — оператор разрешил падать на чужую площадку, когда своя недоступна. */
export function isNetlifyFallbackAllowed(): boolean {
  return process.env.DEPLOY_ALLOW_NETLIFY_FALLBACK === "true"
}

export function resolveDeployTarget(): DeployTargetDecision {
  if (isOwnClusterConfigured()) {
    return {
      target: "own-cluster",
      label: "своя инфраструктура OSGARD",
      reason: "приложение публикуется на наши сервера",
    }
  }

  const missing = missingOwnClusterEnvKeys().join(", ")

  if (isNetlifyFallbackAllowed() && isNetlifyConfigured()) {
    return {
      target: "netlify",
      label: "Netlify (аварийный запас)",
      reason: `своя инфраструктура не сконфигурирована (нет: ${missing}), включён аварийный запас`,
    }
  }

  return {
    target: "none",
    label: "площадка не выбрана",
    reason: isNetlifyConfigured()
      ? `своя инфраструктура не сконфигурирована (нет: ${missing}); публикация на чужую площадку запрещена — включите DEPLOY_ALLOW_NETLIFY_FALLBACK=true, если это осознанное решение`
      : `деплой не сконфигурирован на сервере (нет: ${missing})`,
  }
}

/** Запускает фоновый джоб на выбранной площадке. Вызывается fire-and-forget
 *  после ответа клиенту — ровно тот же контракт, что был у runNetlifyDeployJob. */
export function runDeployJob(projectId: number, target: DeployTarget): void {
  if (target === "own-cluster") {
    void runOwnClusterDeployJob(projectId)
    return
  }
  if (target === "netlify") {
    void runNetlifyDeployJob(projectId)
  }
}
