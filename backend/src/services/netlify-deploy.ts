import { execFile } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import archiver from "archiver"
import db from "../lib/db"
import { normalizeAppProfile } from "../lib/app-profiles"
import { captureError } from "../lib/sentry"
import { buildNextStaticExport, isDockerAvailable } from "./sandbox.service"

/* ================================================================
   OSGARD · Netlify Deploy Service
   ----------------------------------------------------------------
   Серверный NETLIFY_AUTH_TOKEN (единый платформенный аккаунт, НЕ
   пер-пользовательский OAuth) — деплоит статическую сборку
   сгенерированного Next.js-приложения (output:'export') на Netlify.

   Джоб (fire-and-forget, тот же паттерн что app-generator):
   собрать project_files → сборка (npm install + next build → out/)
   в ИЗОЛИРОВАННОЙ Docker-песочнице (sandbox.service), а не на хосте →
   зазипованный out/ → Netlify REST API (создать сайт при первом
   деплое, иначе новый деплой на существующий) → сохранить live_url.

   Сборка сгенерированного ИИ кода на хосте (старое поведение) — это
   исполнение недоверенного кода в процессе бэкенда. Теперь основной
   путь — контейнер; хостовая сборка остаётся лишь как fallback, если
   Docker-демон недоступен (чтобы деплой не падал полностью там, где
   Docker не поднят — например в облаке без DinD).
   ================================================================ */

const execFileAsync = promisify(execFile)

const NETLIFY_API = "https://api.netlify.com/api/v1"
const BUILD_TIMEOUT_MS = 5 * 60 * 1000

function isNetlifyConfigured(): boolean {
  return !!process.env.NETLIFY_AUTH_TOKEN
}

async function writeProjectFiles(dir: string, files: Array<{ path: string; content: string }>) {
  for (const file of files) {
    const target = path.join(dir, file.path)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content, "utf-8")
  }
}

async function runCommand(cmd: string, args: string[], cwd: string, envOverride?: Record<string, string>) {
  await execFileAsync(cmd, args, {
    cwd,
    timeout: BUILD_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    shell: process.platform === "win32",
    env: envOverride ? { ...process.env, ...envOverride } : process.env,
  })
}

async function zipDirectory(sourceDir: string, outZipPath: string) {
  await new Promise<void>((resolve, reject) => {
    const output = require("node:fs").createWriteStream(outZipPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    output.on("close", () => resolve())
    archive.on("error", (err: Error) => reject(err))

    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

async function createOrReuseSite(siteId: string | null, siteName: string, token: string): Promise<{ id: string }> {
  const headers = { Authorization: `Bearer ${token}` }

  if (siteId) {
    const existing = await fetch(`${NETLIFY_API}/sites/${siteId}`, { headers })
    if (existing.ok) {
      const data = (await existing.json()) as { id: string }
      return { id: data.id }
    }
  }

  const created = await fetch(`${NETLIFY_API}/sites`, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ name: siteName }),
  })

  if (!created.ok) {
    const errText = await created.text().catch(() => "")
    throw new Error(`Не удалось создать сайт на Netlify: ${created.status} ${errText}`)
  }

  const data = (await created.json()) as { id: string }
  return { id: data.id }
}

async function uploadDeploy(siteId: string, zipPath: string, token: string): Promise<{ url: string; ssl_url?: string }> {
  const zipBuffer = await fs.readFile(zipPath)

  const res = await fetch(`${NETLIFY_API}/sites/${siteId}/deploys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/zip",
    },
    body: zipBuffer,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Не удалось загрузить деплой на Netlify: ${res.status} ${errText}`)
  }

  return (await res.json()) as { url: string; ssl_url?: string }
}

function slugifySiteName(name: string, projectId: number): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return `osgard-${base || "app"}-${projectId}`.slice(0, 60)
}

/** Асинхронный джоб деплоя — вызывается fire-and-forget сразу после ответа клиенту.
 *  Никогда не бросает наружу: любая ошибка помечает деплой failed. */
export async function runNetlifyDeployJob(projectId: number) {
  if (!isNetlifyConfigured()) {
    db.prepare(`UPDATE projects SET deploy_status = 'failed', deploy_error = ? WHERE id = ?`).run(
      "NETLIFY_AUTH_TOKEN не сконфигурирован на сервере",
      projectId,
    )
    return
  }

  const project: any = db
    .prepare(`SELECT id, name, netlify_site_id, app_profile FROM projects WHERE id = ?`)
    .get(projectId)
  if (!project) return

  /* Публикация статикой физически несовместима с fullstack-приложением: у него нет
     out/, потому что серверные роуты и обращения к базе исполняются в рантайме.
     Отказываем ЗДЕСЬ и с объяснением, а не даём сборке упасть где-то в глубине с
     невнятным логом — «deploy failed» без причины хуже честного отказа. */
  if (normalizeAppProfile(project.app_profile) === "fullstack") {
    db.prepare(`UPDATE projects SET deploy_status = 'failed', deploy_error = ? WHERE id = ?`).run(
      "Приложение с базой данных (профиль fullstack) не публикуется статическим хостингом: " +
        "ему нужен серверный рантайм. Код и база готовы — приложение можно скачать и запустить " +
        "(npm install && npm run build && npm start). Публикация серверных приложений на стороне " +
        "OSGARD появится отдельной волной.",
      projectId,
    )
    return
  }

  const files = db
    .prepare(`SELECT path, content FROM project_files WHERE project_id = ?`)
    .all(projectId) as Array<{ path: string; content: string }>

  if (files.length === 0) {
    db.prepare(`UPDATE projects SET deploy_status = 'failed', deploy_error = ? WHERE id = ?`).run(
      "У проекта нет файлов для деплоя",
      projectId,
    )
    return
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `osgard-deploy-${projectId}-`))

  try {
    const outDir = await buildStaticOut(projectId, files, workDir)

    const zipPath = path.join(os.tmpdir(), `osgard-deploy-${projectId}-${Date.now()}.zip`)
    await zipDirectory(outDir, zipPath)

    try {
      const token = process.env.NETLIFY_AUTH_TOKEN as string
      const siteName = slugifySiteName(project.name, projectId)
      const site = await createOrReuseSite(project.netlify_site_id || null, siteName, token)
      const deploy = await uploadDeploy(site.id, zipPath, token)
      const liveUrl = deploy.ssl_url || deploy.url

      db.prepare(
        `UPDATE projects SET deploy_status = 'deployed', deploy_error = NULL, live_url = ?, netlify_site_id = ? WHERE id = ?`,
      ).run(liveUrl, site.id, projectId)
    } finally {
      await fs.rm(zipPath, { force: true })
    }
  } catch (err: any) {
    captureError("[netlify-deploy] job failed:", err)
    db.prepare(`UPDATE projects SET deploy_status = 'failed', deploy_error = ? WHERE id = ?`).run(
      err?.message || "Неизвестная ошибка деплоя",
      projectId,
    )
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

/**
 * Собирает статический out/ проекта. Основной путь — изолированная Docker-песочница
 * (недоверенный сгенерированный код не исполняется в процессе бэкенда). Если демон
 * Docker недоступен — падаем на прежнюю хостовую сборку (execFile), чтобы деплой не
 * ломался в окружениях без Docker. Возвращает абсолютный путь к готовой out/.
 */
async function buildStaticOut(
  projectId: number,
  files: Array<{ path: string; content: string }>,
  workDir: string,
): Promise<string> {
  if (await isDockerAvailable()) {
    const build = await buildNextStaticExport(files, workDir, {
      timeoutMs: BUILD_TIMEOUT_MS + 3 * 60 * 1000, // install + build внутри контейнера — даём запас
      logLabel: `netlify-deploy-${projectId}`,
    })
    if (!build.ok || !build.outDir) {
      const tail = build.logs.slice(-2000)
      throw new Error(`Сборка в песочнице не удалась${build.timedOut ? " (таймаут)" : ""}:\n${tail}`)
    }
    return build.outDir
  }

  // Fallback: хостовая сборка (Docker не поднят).
  await writeProjectFiles(workDir, files)
  // NODE_ENV=production здесь недопустим — npm install тогда пропускает
  // devDependencies (tailwindcss/postcss/autoprefixer из app-generator.ts),
  // и next build падает с "Cannot find module 'tailwindcss'". На Railway
  // NODE_ENV=production выставлен на самом бэкенд-процессе и без явного
  // override наследуется дочерним npm install — тот же приём уже применён
  // в Docker-пути сборки (см. sandbox.service.ts: install без NODE_ENV=production).
  await runCommand("npm", ["install", "--no-audit", "--no-fund"], workDir, { NODE_ENV: "development" })
  // А вот next build, наоборот, должен идти с NODE_ENV=production — иначе Next.js
  // смешивает dev/prod-рантаймы при статическом экспорте (TypeError: useContext
  // null на prerender).
  await runCommand("npx", ["next", "build"], workDir, { NODE_ENV: "production" })
  return path.join(workDir, "out")
}

export { isNetlifyConfigured }
