import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import db from "../lib/db"
import { captureError } from "../lib/sentry"
import { recordClusterBuildSuccess, recordRealBuildFailure } from "../lib/engineering-gate"

/* ================================================================
   OSGARD · Деплой сгенерированных приложений на СВОЮ инфраструктуру
   ----------------------------------------------------------------
   Мы продаём аренду собственной инфраструктуры — значит приложения,
   рождённые движком, обязаны жить на наших серверах (*.osgard.cloud),
   а не на чужой площадке. Netlify остаётся только аварийным запасом
   (см. resolveDeployTarget в deploy-target.ts).

   Контур деплоя уже существует (репозиторий osgard-infra, боевой
   SUPER DAY на superday.osgard.cloud). Его контракт:

     1) исходники приложения лежат в git-репозитории нашего Forgejo
        (git.osgard.cloud);
     2) в корне репозитория есть Dockerfile — control-plane собирает
        образ, поднимает контейнер и проверяет здоровье внутреннего
        порта;
     3) регистрация приложения — POST /api/projects
        {slug, repo_full_name, internal_port, dockerfile_path, ...};
     4) запуск деплоя — POST /api/projects/:slug/deploy → 202
        {deployment_id, host};
     5) наблюдение — GET /api/projects/:slug/deployments, терминальный
        успех ровно один: status === 'live';
     6) адрес приложения — <slug>.<BASE_DOMAIN>, маршрут в Caddy
        control-plane заводит сам.

   Поэтому джоб здесь: файлы проекта → Dockerfile+nginx.conf (если
   движок их не сгенерировал) → коммит и push в Forgejo → регистрация
   → запуск → опрос до терминального статуса → live_url.

   Сборка идёт ВНУТРИ нашего кластера (docker build на CORE), а не в
   процессе бэкенда — недоверенный сгенерированный код не исполняется
   на хосте платформы вообще. Это отличие от netlify-пути, где сборку
   приходилось делать у себя, чтобы отдать готовый out/.
   ================================================================ */

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 5 * 60 * 1000
const POLL_INTERVAL_MS = 3_000
/** Bound every control-plane and Forgejo request. A configured but unreachable
 * infrastructure must fail the job promptly instead of relying on the much
 * longer runtime socket timeout. */
export const CLUSTER_REQUEST_TIMEOUT_MS = 15_000
/** Сборка образа + старт + внутренняя и внешняя проверка здоровья. Боевые
 *  деплои SUPER DAY укладываются в секунды, но первый деплой нового
 *  приложения тянет базовые образы и npm install. */
const DEPLOY_TIMEOUT_MS = 15 * 60 * 1000

/** Статусы control-plane, в которых деплой ещё идёт (types.ts::NON_TERMINAL_STATUSES).
 *  Продублировано намеренно: платформа не зависит от кода инфраструктуры по сборке,
 *  только по HTTP-контракту. Список закреплён тестом own-cluster-deploy.test.ts. */
const NON_TERMINAL_STATUSES = [
  "queued",
  "fetching",
  "building",
  "pushing",
  "starting",
  "health_check",
] as const

/** Единственный терминальный успех. Всё остальное терминальное — отказ. */
const LIVE_STATUS = "live"

/** Человеческие причины отказа: статус control-plane → что это значит для автора приложения. */
const FAILURE_REASONS: Record<string, string> = {
  build_failed: "сборка образа не удалась",
  push_failed: "не удалось загрузить образ в реестр",
  start_failed: "контейнер не запустился",
  health_failed: "приложение не ответило на проверку здоровья",
  rolled_back: "деплой откатили: новая версия не прошла внешнюю проверку",
  failed_interrupted: "деплой прерван перезапуском control-plane",
  environment_gone: "окружение удалено во время деплоя",
}

export interface OwnClusterConfig {
  /** База API control-plane, например https://cp.osgard.cloud */
  apiUrl: string
  apiToken: string
  /** Домен, под которым живут приложения: <slug>.<baseDomain> */
  baseDomain: string
  /** База нашего Forgejo, например https://git.osgard.cloud */
  forgejoUrl: string
  /** Владелец репозиториев приложений (пользователь или организация в Forgejo) */
  forgejoOwner: string
  /** Пользователь для basic-auth при push (обычно бот) */
  forgejoUser: string
  forgejoToken: string
}

/** Собирает конфиг из окружения. null — своя инфраструктура не подключена,
 *  вызывающий обязан честно сказать об этом, а не молча уйти на чужую площадку. */
export function getOwnClusterConfig(): OwnClusterConfig | null {
  const apiUrl = process.env.OSGARD_CLUSTER_API_URL
  const apiToken = process.env.OSGARD_CLUSTER_API_TOKEN
  const forgejoUrl = process.env.OSGARD_FORGEJO_URL
  const forgejoOwner = process.env.OSGARD_FORGEJO_OWNER
  const forgejoToken = process.env.OSGARD_FORGEJO_TOKEN

  if (!apiUrl || !apiToken || !forgejoUrl || !forgejoOwner || !forgejoToken) return null

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    apiToken,
    baseDomain: process.env.OSGARD_CLUSTER_BASE_DOMAIN || "osgard.cloud",
    forgejoUrl: forgejoUrl.replace(/\/+$/, ""),
    forgejoOwner,
    // По умолчанию пушим от имени владельца репозиториев — отдельный
    // технический пользователь нужен редко, но должен быть возможен.
    forgejoUser: process.env.OSGARD_FORGEJO_USER || forgejoOwner,
    forgejoToken,
  }
}

export function isOwnClusterConfigured(): boolean {
  return getOwnClusterConfig() !== null
}

/** Какие переменные окружения не хватает — для честного текста ошибки в UI. */
export function missingOwnClusterEnvKeys(): string[] {
  const required = [
    "OSGARD_CLUSTER_API_URL",
    "OSGARD_CLUSTER_API_TOKEN",
    "OSGARD_FORGEJO_URL",
    "OSGARD_FORGEJO_OWNER",
    "OSGARD_FORGEJO_TOKEN",
  ]
  return required.filter((key) => !process.env[key])
}

/** Слаг приложения = поддомен третьего уровня и имя репозитория одновременно.
 *  Ограничения жёстче, чем у netlify-имени: только [a-z0-9-] (валидатор
 *  control-plane), не длиннее 63 символов (метка DNS), без дефиса по краям. */
export function slugifyClusterSlug(name: string, projectId: number): string {
  const base = (name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  const suffix = `-${projectId}`
  const prefix = "app-"
  const room = 63 - prefix.length - suffix.length
  const trimmed = base.slice(0, Math.max(room, 0)).replace(/-+$/g, "")
  return `${prefix}${trimmed || "osgard"}${suffix}`
}

/** Вырезает секреты из любого текста, который может уехать в БД, логи или UI.
 *  git пишет remote-URL в текст ошибки, а в URL лежит токен Forgejo — без этой
 *  функции первая же неудачная попытка push опубликовала бы его в deploy_error. */
export function redactSecrets(text: string, secrets: string[]): string {
  let result = text
  for (const secret of secrets) {
    if (!secret) continue
    result = result.split(secret).join("***")
  }
  // На случай, если токен попал в URL в percent-encoded виде.
  return result.replace(/(https?:\/\/)[^\s/@]*:[^\s/@]*@/g, "$1***@")
}

/** Классификация ответа control-plane по статусу деплоя. */
export function classifyDeploymentStatus(status: string): "pending" | "live" | "failed" {
  if (status === LIVE_STATUS) return "live"
  return (NON_TERMINAL_STATUSES as readonly string[]).includes(status) ? "pending" : "failed"
}

export function describeFailure(status: string): string {
  return FAILURE_REASONS[status] || `деплой завершился статусом ${status}`
}

/** Отказ деплоя с сохранённым статусом control-plane. Текст ошибки уезжает
 *  пользователю, а статус нужен коду: `build_failed` — это приговор реального
 *  `next build`, и он обязан вернуться в инженерный вердикт проекта, а не
 *  остаться строкой в deploy_error (lib/engineering-gate). */
export class DeploymentFailedError extends Error {
  constructor(readonly deploymentStatus: string, message: string) {
    super(message)
    this.name = "DeploymentFailedError"
  }
}

/** Статусы, означающие «код не собрался» — в отличие от инфраструктурных отказов
 *  (реестр, health-check, откат), за которые автор приложения не отвечает. */
export function isBuildFailure(status: string): boolean {
  return status === "build_failed"
}

/** Dockerfile для статического экспорта Next.js (движок генерирует
 *  output:"export", см. app-generator.ts). Сборка в node-образе, раздача —
 *  nginx на порту 80: control-plane проверяет здоровье именно внутреннего
 *  порта, а next start для экспортированного приложения не нужен вовсе.
 *  NODE_ENV на install не выставляем — иначе npm пропустит devDependencies
 *  (tailwindcss/postcss), ровно та же ловушка, что в netlify-пути. */
export const GENERATED_DOCKERFILE = `# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
ENV NODE_ENV=production
RUN npx next build

FROM nginx:alpine
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
`

/** try_files с .html — статический экспорт Next.js кладёт /about как about.html,
 *  без этой строки любой переход по прямой ссылке отдавал бы 404. */
export const GENERATED_NGINX_CONF = `server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  location / {
    try_files $uri $uri.html $uri/index.html /index.html;
  }

  error_page 404 /404.html;
}
`

export const CLUSTER_INTERNAL_PORT = 80
export const CLUSTER_BRANCH = "main"

async function writeProjectFiles(dir: string, files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    const target = path.join(dir, file.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content, "utf-8")
  }
}

/** Добавляет инфраструктурные файлы, если движок их не сгенерировал. Свои
 *  Dockerfile/nginx.conf автора мы не перетираем — иначе кастомный бэкенд
 *  приложения (когда движок научится их делать) молча превратился бы в
 *  статику. */
export function infraFilesToAdd(
  existingPaths: string[],
): Array<{ path: string; content: string }> {
  const has = (p: string) => existingPaths.includes(p)
  const extra: Array<{ path: string; content: string }> = []
  if (!has("Dockerfile")) extra.push({ path: "Dockerfile", content: GENERATED_DOCKERFILE })
  if (!has("deploy/nginx.conf")) extra.push({ path: "deploy/nginx.conf", content: GENERATED_NGINX_CONF })
  if (!has(".dockerignore")) {
    extra.push({ path: ".dockerignore", content: "node_modules\n.next\nout\n.git\n" })
  }
  return extra
}

async function runGit(args: string[], cwd: string, secrets: string[]) {
  try {
    await execFileAsync("git", args, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        // Ни одного интерактивного запроса пароля: иначе push в закрытый
        // репозиторий подвесил бы джоб до таймаута.
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "echo",
      },
    })
  } catch (err: any) {
    const detail = redactSecrets(String(err?.stderr || err?.message || err), secrets)
    throw new Error(`git ${args[0]} не удался: ${detail}`)
  }
}

async function forgejoFetch(
  cfg: OwnClusterConfig,
  pathname: string,
  init: { method?: string; body?: unknown } = {},
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`${cfg.forgejoUrl}/api/v1${pathname}`, {
    method: init.method || "GET",
    signal: AbortSignal.timeout(CLUSTER_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `token ${cfg.forgejoToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

/** Ручка создания репозитория зависит от того, кто владелец: сам пользователь
 *  токена или организация. Решение отдельной функцией — чтобы закрепить его
 *  тестом: угадывание по коду ответа Forgejo уже приводило к падению деплоя
 *  (403 «нужен write:organization» на владельце, который вовсе не организация). */
export function repoCreateEndpoint(owner: string, tokenLogin: string | undefined): string {
  const ownerIsSelf = !!tokenLogin && tokenLogin.toLowerCase() === owner.toLowerCase()
  return ownerIsSelf ? "/user/repos" : `/orgs/${owner}/repos`
}

/** Создаёт репозиторий приложения в нашем Forgejo, если его ещё нет.
 *  Приватный: исходники клиентского приложения — не публичные по умолчанию. */
async function ensureForgejoRepo(cfg: OwnClusterConfig, repoName: string): Promise<void> {
  const existing = await forgejoFetch(cfg, `/repos/${cfg.forgejoOwner}/${repoName}`)
  if (existing.ok) return
  if (existing.status !== 404) {
    const text = redactSecrets(await existing.text().catch(() => ""), [cfg.forgejoToken])
    throw new Error(`Forgejo не ответил на проверку репозитория: ${existing.status} ${text}`)
  }

  const payload = { name: repoName, private: true, auto_init: false, default_branch: CLUSTER_BRANCH }

  /* Владелец бывает и организацией, и самим пользователем токена, и ручка для них
     разная. Спрашиваем Forgejo, кто мы, а не угадываем по коду ответа: прежняя
     версия пробовала /orgs/... первой и откатывалась на /user/repos по 404 — но
     Forgejo на чужой/несуществующей организации отвечает 403 (проверка скоупа
     идёт РАНЬШЕ разрешения имени), откат не срабатывал, и деплой падал с
     «нужен scope write:organization» там, где организации нет вовсе.
     Проверено выстрелом в прод 30.07.2026 на владельце-пользователе. */
  const whoami = await forgejoFetch(cfg, `/user`)
  const login = whoami.ok
    ? ((await whoami.json().catch(() => null)) as { login?: string } | null)?.login
    : undefined
  const endpoint = repoCreateEndpoint(cfg.forgejoOwner, login)
  const ownerIsSelf = endpoint === "/user/repos"

  const created = await forgejoFetch(cfg, endpoint, { method: "POST", body: payload })

  // 409 — кто-то создал репозиторий параллельно; это успех, а не отказ.
  if (!created.ok && created.status !== 409) {
    const text = redactSecrets(await created.text().catch(() => ""), [cfg.forgejoToken])
    // Причину отказа называем адресно: без этого оператор чинит не то место —
    // «403» на владельце-организации значит нехватку скоупа токена, а не
    // отсутствие организации.
    const hint = !whoami.ok
      ? ` Токен Forgejo не опознан (GET /user → ${whoami.status}) — проверьте OSGARD_FORGEJO_TOKEN.`
      : ownerIsSelf
        ? ` Владелец ${cfg.forgejoOwner} — это сам пользователь токена; нужен scope write:repository.`
        : ` Владелец ${cfg.forgejoOwner} — организация (пользователь токена: ${login}); нужен scope write:organization.`
    throw new Error(`Не удалось создать репозиторий в Forgejo: ${created.status} ${text}${hint}`)
  }
}

/** Remote с basic-auth для push. Токен обязателен к экранированию: символы вроде
 *  '@' или '/' в нём иначе разорвали бы URL и push ушёл бы не туда. Результат
 *  НИКОГДА не логируется — только через redactSecrets. */
export function buildForgejoRemote(cfg: OwnClusterConfig, repoName: string): string {
  const url = new URL(cfg.forgejoUrl)
  url.username = encodeURIComponent(cfg.forgejoUser)
  url.password = encodeURIComponent(cfg.forgejoToken)
  url.pathname = `/${cfg.forgejoOwner}/${repoName}.git`
  return url.toString()
}

async function pushToForgejo(
  cfg: OwnClusterConfig,
  repoName: string,
  workDir: string,
  commitMessage: string,
) {
  const secrets = [cfg.forgejoToken]
  const remote = buildForgejoRemote(cfg, repoName)

  await runGit(["init", "-b", CLUSTER_BRANCH], workDir, secrets)
  await runGit(["add", "-A"], workDir, secrets)
  await runGit(
    [
      "-c",
      "user.name=OSGARD Platform",
      "-c",
      "user.email=platform@osgard.cloud",
      "commit",
      "-m",
      commitMessage,
    ],
    workDir,
    secrets,
  )
  // force: содержимое проекта в платформе — единственный источник истины,
  // история репозитория приложения вторична и переписывается каждым деплоем.
  await runGit(["push", "--force", remote, `HEAD:${CLUSTER_BRANCH}`], workDir, secrets)

  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: workDir })
  return stdout.trim()
}

async function clusterFetch(
  cfg: OwnClusterConfig,
  pathname: string,
  init: { method?: string; body?: unknown } = {},
  fetcher: typeof fetch = fetch,
) {
  return fetcher(`${cfg.apiUrl}${pathname}`, {
    method: init.method || "GET",
    signal: AbortSignal.timeout(CLUSTER_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
}

export interface OwnClusterReadiness {
  ok: boolean
  reason?: string
}

/**
 * Verify the two services a deployment cannot work without before marking a
 * project as deploying. This is deliberately read-only: no repository or
 * cluster project is created during the check.
 */
export async function preflightOwnCluster(
  cfg: OwnClusterConfig | null = getOwnClusterConfig(),
  fetcher: typeof fetch = fetch,
): Promise<OwnClusterReadiness> {
  if (!cfg) {
    return { ok: false, reason: `своя инфраструктура не настроена (нет: ${missingOwnClusterEnvKeys().join(", ")})` }
  }

  const [cluster, forgejo] = await Promise.allSettled([
    clusterFetch(cfg, "/api/projects", {}, fetcher),
    forgejoFetch(cfg, "/user", {}, fetcher),
  ])

  const problems: string[] = []
  if (cluster.status === "rejected") problems.push("control-plane недоступен")
  else if (!cluster.value.ok) problems.push(`control-plane ответил ${cluster.value.status}`)

  if (forgejo.status === "rejected") problems.push("Forgejo недоступен")
  else if (!forgejo.value.ok) problems.push(`Forgejo ответил ${forgejo.value.status}`)

  return problems.length === 0
    ? { ok: true }
    : { ok: false, reason: problems.join("; ") }
}

/** Регистрирует приложение в control-plane (идемпотентно).
 *  source_mode='webhook' — репозиторий наш, зеркалом он не является; вебхук
 *  мы не подключаем, деплой запускаем сами ручкой /deploy. */
async function ensureClusterProject(cfg: OwnClusterConfig, slug: string, repoFullName: string) {
  const created = await clusterFetch(cfg, "/api/projects", {
    method: "POST",
    body: {
      slug,
      repo_full_name: repoFullName,
      internal_port: CLUSTER_INTERNAL_PORT,
      dockerfile_path: "Dockerfile",
      default_branch: CLUSTER_BRANCH,
      health_check_path: "/",
      source_mode: "webhook",
    },
  })

  if (created.status === 201) return
  if (created.status !== 409) {
    const text = redactSecrets(await created.text().catch(() => ""), [cfg.apiToken])
    throw new Error(`control-plane отклонил регистрацию приложения: ${created.status} ${text}`)
  }

  // 409: слаг или репозиторий уже заняты. Это норма при повторном деплое —
  // но только если занят НАШИМ же репозиторием. Иначе мы бы задеплоили чужой
  // код под своим адресом.
  const list = await clusterFetch(cfg, "/api/projects")
  if (!list.ok) {
    throw new Error(`control-plane не отдал список проектов: ${list.status}`)
  }
  const { projects } = (await list.json()) as { projects: Array<{ slug: string; repo_full_name: string }> }
  const existing = projects.find((p) => p.slug === slug)
  if (!existing) {
    throw new Error(
      `control-plane сообщил о конфликте, но проекта со слагом ${slug} нет — вероятно, репозиторий ${repoFullName} уже привязан к другому слагу`,
    )
  }
  if (existing.repo_full_name !== repoFullName) {
    throw new Error(
      `слаг ${slug} уже занят другим репозиторием (${existing.repo_full_name}) — деплой остановлен, чтобы не подменить чужое приложение`,
    )
  }
}

async function triggerClusterDeploy(cfg: OwnClusterConfig, slug: string, commitSha: string) {
  const res = await clusterFetch(cfg, `/api/projects/${slug}/deploy`, {
    method: "POST",
    body: { commit_sha: commitSha, branch: CLUSTER_BRANCH },
  })

  if (res.status === 202) {
    return (await res.json()) as { deployment_id: number; host: string; status: string }
  }

  const text = redactSecrets(await res.text().catch(() => ""), [cfg.apiToken])
  if (res.status === 409) {
    throw new Error(`для этого приложения уже идёт деплой на кластере: ${text}`)
  }
  throw new Error(`control-plane не принял запрос деплоя: ${res.status} ${text}`)
}

async function waitForDeployment(
  cfg: OwnClusterConfig,
  slug: string,
  deploymentId: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<void> {
  const deadline = now() + DEPLOY_TIMEOUT_MS
  let lastStatus = "queued"

  while (now() < deadline) {
    await sleep(POLL_INTERVAL_MS)

    const res = await clusterFetch(cfg, `/api/projects/${slug}/deployments`)
    if (!res.ok) {
      // Разовый сбой опроса не повод объявлять деплой упавшим — он идёт на
      // кластере независимо от нашей видимости.
      continue
    }
    const { deployments } = (await res.json()) as {
      deployments: Array<{ id: number; status: string }>
    }
    const deployment = deployments.find((d) => d.id === deploymentId)
    if (!deployment) continue

    lastStatus = deployment.status
    const verdict = classifyDeploymentStatus(deployment.status)
    if (verdict === "live") return
    if (verdict === "failed") {
      throw new DeploymentFailedError(deployment.status, describeFailure(deployment.status))
    }
  }

  throw new Error(
    `деплой не завершился за ${Math.round(DEPLOY_TIMEOUT_MS / 60_000)} минут (последний статус: ${lastStatus})`,
  )
}

function failProject(projectId: number, message: string) {
  db.prepare(`UPDATE projects SET deploy_status = 'failed', deploy_error = ? WHERE id = ?`).run(
    message,
    projectId,
  )
}

/** Асинхронный джоб деплоя на свою инфраструктуру — fire-and-forget, как и
 *  netlify-путь. Никогда не бросает наружу: любая ошибка помечает деплой failed. */
export async function runOwnClusterDeployJob(projectId: number) {
  const cfg = getOwnClusterConfig()
  if (!cfg) {
    failProject(
      projectId,
      `Своя инфраструктура не сконфигурирована на сервере (нет: ${missingOwnClusterEnvKeys().join(", ")})`,
    )
    return
  }

  const project: any = db.prepare(`SELECT id, name FROM projects WHERE id = ?`).get(projectId)
  if (!project) return

  const files = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(projectId) as Array<{ path: string; content: string }>

  if (files.length === 0) {
    failProject(projectId, "У проекта нет файлов для деплоя")
    return
  }

  const slug = slugifyClusterSlug(project.name, projectId)
  const repoFullName = `${cfg.forgejoOwner}/${slug}`
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `osgard-cluster-${projectId}-`))

  try {
    await writeProjectFiles(workDir, [...files, ...infraFilesToAdd(files.map((f) => f.path))])

    await ensureForgejoRepo(cfg, slug)
    const commitSha = await pushToForgejo(
      cfg,
      slug,
      workDir,
      `OSGARD: деплой проекта #${projectId} (${project.name || "без названия"})`,
    )

    await ensureClusterProject(cfg, slug, repoFullName)
    const started = await triggerClusterDeploy(cfg, slug, commitSha)

    // Адрес известен заранее (control-plane отдаёт его в host) — но записываем
    // его только после успешного завершения, чтобы в UI не появилась ссылка на
    // приложение, которое не поднялось.
    await waitForDeployment(cfg, slug, started.deployment_id)

    recordClusterBuildSuccess(projectId, { status: "live" })

    const liveUrl = `https://${started.host || `${slug}.${cfg.baseDomain}`}`
    db.prepare(
      `UPDATE projects SET deploy_status = 'deployed', deploy_error = NULL, live_url = ?, cluster_slug = ? WHERE id = ?`,
    ).run(liveUrl, slug, projectId)
  } catch (err: any) {
    const message = redactSecrets(
      String(err?.message || "Неизвестная ошибка деплоя"),
      [cfg.apiToken, cfg.forgejoToken],
    )
    captureError("[own-cluster-deploy] job failed:", new Error(message))
    failProject(projectId, message)

    /* Сборка в кластере — единственный настоящий `next build`, который у нас есть
       (в облачном рантайме платформы Docker нет, песочница возвращает skipped).
       Раз он сказал «нет», проект перестаёт считаться проверенным: иначе студия
       продолжит показывать «Проверено» и предлагать публикацию того же кода. */
    if (err instanceof DeploymentFailedError && isBuildFailure(err.deploymentStatus)) {
      recordRealBuildFailure(projectId, { source: "cluster", status: err.deploymentStatus, message })
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}
