import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import crypto from "node:crypto"
import { captureError } from "../lib/sentry"

/* ================================================================
   OSGARD · Sandbox Service (Docker)
   ----------------------------------------------------------------
   Запуск СГЕНЕРИРОВАННОГО ИИ кода любой сложности в изолированном
   одноразовом Docker-контейнере — вместо небезопасного исполнения
   на хосте (как раньше делал netlify-deploy: execFile npm/next прямо
   в процессе бэкенда).

   Модель изоляции (решение владельца продукта — «полная песочница»):
   - Одноразовый контейнер на каждую сборку (docker create → cp →
     start → rm -f), никакого переиспользования состояния между
     проектами.
   - Файлы проекта НЕ монтируются с хоста (bind-mount), а копируются
     внутрь через `docker cp` — на Windows это и быстрее (node_modules
     остаётся в overlay-слое контейнера, а не в медленном bind-mount
     Docker Desktop), и безопаснее (хостовая ФС не видна контейнеру).
   - Лимиты: память, CPU, кол-во процессов (pids), стена по времени.
   - `--cap-drop ALL` + `--security-opt no-new-privileges` — нельзя
     повысить привилегии/получить опасные capability.
   - `--network none` по умолчанию. Сеть включается ЯВНО только для
     фазы установки зависимостей (npm/pip физически должны сходить в
     реестр) — фаза запуска/проверки самого сгенерированного кода сети
     не получает.

   Внутри контейнера процесс идёт от root: файлы, скопированные через
   `docker cp`, принадлежат root, и non-root пользователю их было бы не
   перезаписать (npm install / next build пишут в рабочую директорию).
   root здесь безопасен ровно потому, что все capability сброшены,
   сеть по умолчанию отключена, контейнер эфемерный и ресурсно
   ограничен — стандартный подход эфемерных CI-сборок.
   ================================================================ */

const execFileAsync = promisify(execFile)

export interface SandboxFile {
  path: string
  content: string
}

export interface RunInSandboxOptions {
  /** Файлы проекта — пишутся в /app внутри контейнера. */
  files: SandboxFile[]
  /** Docker-образ (например "node:20-slim" или "python:3.12-slim"). */
  image: string
  /** Команда для `sh -c` внутри /app (например "npm install && npx next build"). */
  command: string
  /** Разрешить сеть контейнеру. По умолчанию false (--network none). */
  network?: boolean
  /** Лимит памяти в МБ (по умолчанию 1024). */
  memoryMb?: number
  /** Лимит CPU в ядрах (по умолчанию 1.5). */
  cpus?: number
  /** Лимит числа процессов (по умолчанию 512). */
  pidsLimit?: number
  /** Стена по времени в мс (по умолчанию 5 мин). */
  timeoutMs?: number
  /** Пути внутри /app, которые нужно вытащить обратно на хост (например ["out"]). */
  extractPaths?: string[]
  /** Куда на хосте класть извлечённые extractPaths (создаётся, если нет). */
  extractToDir?: string
  /** Метка для логов. */
  logLabel?: string
  /**
   * true — образ уже содержит /app (например преднастроенный образ с node_modules):
   * staged-файлы копируются ВНУТРЬ существующего /app (слияние, node_modules
   * сохраняется). false (по умолчанию) — /app создаётся с нуля из staged-файлов.
   */
  workdirPrepopulated?: boolean
}

export interface SandboxResult {
  ok: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  durationMs: number
  /** Абсолютные пути к извлечённым артефактам на хосте (по extractPaths). */
  extracted: string[]
}

const DOCKER_AVAILABLE_TTL_MS = 30_000
let dockerAvailableCache: { value: boolean; at: number } | null = null

/** Проверяет, что демон Docker доступен (кешируется на 30с, чтобы не дёргать CLI на каждый вызов). */
export async function isDockerAvailable(): Promise<boolean> {
  const now = Date.now()
  if (dockerAvailableCache && now - dockerAvailableCache.at < DOCKER_AVAILABLE_TTL_MS) {
    return dockerAvailableCache.value
  }
  let value = false
  try {
    await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"], { timeout: 10_000 })
    value = true
  } catch {
    value = false
  }
  dockerAvailableCache = { value, at: now }
  return value
}

/** Нормализует относительный путь файла проекта, отсекая traversal (../, абсолютные пути). */
function safeRelPath(p: string): string | null {
  const normalized = path.posix.normalize(p.replace(/\\/g, "/")).replace(/^\/+/, "")
  if (!normalized || normalized === "." || normalized.startsWith("..") || normalized.includes("/../")) {
    return null
  }
  return normalized
}

async function stageFiles(stageAppDir: string, files: SandboxFile[]): Promise<void> {
  await fs.mkdir(stageAppDir, { recursive: true })
  for (const file of files) {
    const rel = safeRelPath(file.path)
    if (!rel) continue
    const target = path.join(stageAppDir, rel)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, file.content, "utf-8")
  }
}

/**
 * Запускает команду в одноразовом Docker-контейнере. Никогда не бросает наружу
 * — при ошибке инфраструктуры возвращает ok:false с диагностикой в stderr.
 */
export async function runInSandbox(opts: RunInSandboxOptions): Promise<SandboxResult> {
  const {
    files,
    image,
    command,
    network = false,
    memoryMb = 1024,
    cpus = 1.5,
    pidsLimit = 512,
    timeoutMs = 5 * 60 * 1000,
    extractPaths = [],
    extractToDir,
    logLabel = "sandbox",
    workdirPrepopulated = false,
  } = opts

  const started = Date.now()
  const empty: SandboxResult = { ok: false, exitCode: null, stdout: "", stderr: "", timedOut: false, durationMs: 0, extracted: [] }

  if (!(await isDockerAvailable())) {
    return { ...empty, stderr: "Docker-демон недоступен (запусти Docker Desktop)", durationMs: Date.now() - started }
  }

  const containerName = `osgard-sb-${crypto.randomBytes(6).toString("hex")}`
  const stageDir = await fs.mkdtemp(path.join(os.tmpdir(), `osgard-stage-${containerName}-`))
  const stageAppDir = path.join(stageDir, "app")

  let created = false
  try {
    await stageFiles(stageAppDir, files)

    /* docker create — контейнер ещё не запущен, только описан с лимитами. */
    const createArgs = [
      "create",
      "--name", containerName,
      "--network", network ? "bridge" : "none",
      "--memory", `${memoryMb}m`,
      "--memory-swap", `${memoryMb}m`, // без свопа сверх лимита памяти
      "--cpus", String(cpus),
      "--pids-limit", String(pidsLimit),
      "--security-opt", "no-new-privileges",
      "--cap-drop", "ALL",
      "-w", "/app",
      image,
      "sh", "-c", command,
    ]
    await execFileAsync("docker", createArgs, { timeout: 30_000 })
    created = true

    /* Копируем staged-файлы внутрь. Две семантики docker cp:
       - workdirPrepopulated=false (обычный образ, /app ещё нет): копируем каталог
         "app" в корень "/", docker создаёт /app с содержимым. Форма ":/app"
         неоднозначна, когда /app не существует.
       - workdirPrepopulated=true (образ уже с /app и node_modules): копируем
         СОДЕРЖИМОЕ (stageAppDir/.) внутрь существующего /app — слияние поверх
         node_modules, не затирая их. */
    if (workdirPrepopulated) {
      await execFileAsync("docker", ["cp", `${stageAppDir}/.`, `${containerName}:/app`], {
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
      })
    } else {
      await execFileAsync("docker", ["cp", stageAppDir, `${containerName}:/`], {
        timeout: 60_000,
        maxBuffer: 64 * 1024 * 1024,
      })
    }

    /* docker start -a — стримим логи, ждём выхода с жёстким таймаутом. */
    const runResult = await startAndWait(containerName, timeoutMs, logLabel)

    /* Извлекаем артефакты (например out/) обратно на хост, если сборка успешна. */
    const extracted: string[] = []
    if (runResult.exitCode === 0 && extractPaths.length > 0 && extractToDir) {
      await fs.mkdir(extractToDir, { recursive: true })
      for (const p of extractPaths) {
        const rel = safeRelPath(p)
        if (!rel) continue
        try {
          await execFileAsync("docker", ["cp", `${containerName}:/app/${rel}`, extractToDir], {
            timeout: 60_000,
            maxBuffer: 64 * 1024 * 1024,
          })
          extracted.push(path.join(extractToDir, path.basename(rel)))
        } catch (err) {
          captureError(`[${logLabel}] extract ${rel} failed:`, err)
        }
      }
    }

    return {
      ok: runResult.exitCode === 0,
      exitCode: runResult.exitCode,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      timedOut: runResult.timedOut,
      durationMs: Date.now() - started,
      extracted,
    }
  } catch (err: any) {
    captureError(`[${logLabel}] sandbox run failed:`, err)
    return { ...empty, stderr: err?.message || "Ошибка песочницы", durationMs: Date.now() - started }
  } finally {
    if (created) {
      await execFileAsync("docker", ["rm", "-f", containerName], { timeout: 30_000 }).catch(() => {})
    }
    await fs.rm(stageDir, { recursive: true, force: true }).catch(() => {})
  }
}

export interface NextBuildResult {
  ok: boolean
  /** Абсолютный путь к директории out/ на хосте (только при ok). */
  outDir: string | null
  logs: string
  timedOut: boolean
  durationMs: number
}

export const PREBAKED_NEXT_IMAGE = "osgard-sandbox-next:latest"

/** Есть ли локально преднастроенный образ с node_modules (кешируется на 30с). */
let prebakedCache: { value: boolean; at: number } | null = null
export async function isPrebakedImageAvailable(): Promise<boolean> {
  const now = Date.now()
  if (prebakedCache && now - prebakedCache.at < 30_000) return prebakedCache.value
  let value = false
  try {
    const { stdout } = await execFileAsync("docker", ["images", "-q", PREBAKED_NEXT_IMAGE], { timeout: 10_000 })
    value = stdout.trim().length > 0
  } catch {
    value = false
  }
  prebakedCache = { value, at: now }
  return value
}

/**
 * Собирает сгенерированный Next.js-проект со статическим экспортом (output:"export")
 * в изолированном контейнере и вытаскивает готовую out/ на хост. Используется и
 * деплоем (netlify-deploy), и проверкой сборки (verifyBuildInSandbox ниже).
 *
 * Быстрый путь — преднастроенный образ osgard-sandbox-next (node_modules уже внутри):
 * сборка идёт БЕЗ СЕТИ (--network none) и без npm install — только `next build`.
 * Если проект добавил зависимости, которых нет в образе, next build упадёт с
 * "module not found" — тогда падаем на медленный путь с реальным npm install
 * (node:20-slim + сеть). Так покрываются оба генератора: фикс-набор app-generator
 * (быстро, оффлайн) и произвольные зависимости 9-стадийного пайплайна (install).
 *
 * npm install (медленный путь) идёт БЕЗ NODE_ENV=production (иначе не поставятся
 * devDependencies — tailwind/typescript/postcss, без которых build падает), а сам
 * build — с NODE_ENV=production (иначе Next.js мешает dev/prod рантаймы при prerender).
 */
export async function buildNextStaticExport(
  files: SandboxFile[],
  extractToDir: string,
  opts?: { timeoutMs?: number; logLabel?: string },
): Promise<NextBuildResult> {
  const timeoutMs = opts?.timeoutMs ?? 8 * 60 * 1000
  const logLabel = opts?.logLabel ?? "sandbox-next-build"

  // Быстрый оффлайн-путь через преднастроенный образ.
  if (await isPrebakedImageAvailable()) {
    const fast = await runInSandbox({
      files,
      image: PREBAKED_NEXT_IMAGE,
      command: "NODE_ENV=production npx next build",
      network: false, // node_modules уже в образе — сеть не нужна
      memoryMb: 2048,
      cpus: 2,
      timeoutMs,
      extractPaths: ["out"],
      extractToDir,
      workdirPrepopulated: true,
      logLabel: `${logLabel}-prebaked`,
    })
    const outDir = fast.extracted.find((p) => path.basename(p) === "out") ?? null
    if (fast.ok && outDir) {
      return { ok: true, outDir, logs: joinLogs(fast), timedOut: fast.timedOut, durationMs: fast.durationMs }
    }
    // Оффлайн-сборка не удалась (вероятно, недостающая зависимость) — пробуем install-путь.
  }

  const result = await runInSandbox({
    files,
    image: "node:20-slim",
    command: "npm install --no-audit --no-fund && NODE_ENV=production npx next build",
    network: true, // npm install физически должен сходить в реестр
    memoryMb: 2048,
    cpus: 2,
    timeoutMs: timeoutMs + 4 * 60 * 1000, // install добавляет времени
    extractPaths: ["out"],
    extractToDir,
    logLabel: `${logLabel}-install`,
  })

  const outDir = result.extracted.find((p) => path.basename(p) === "out") ?? null
  return {
    ok: result.ok && outDir !== null,
    outDir: result.ok ? outDir : null,
    logs: joinLogs(result),
    timedOut: result.timedOut,
    durationMs: result.durationMs,
  }
}

function joinLogs(r: SandboxResult): string {
  return [r.stdout, r.stderr].filter(Boolean).join("\n")
}

export interface VerifyBuildResult {
  ok: boolean
  /** true — Docker недоступен, проверка не выполнялась (не путать с ok:false = сборка упала). */
  skipped: boolean
  logs: string
  timedOut: boolean
  durationMs: number
}

/**
 * Проверяет, что сгенерированный Next.js-проект РЕАЛЬНО собирается (не только
 * проходит ts.transpileModule) — полноценный `next build` в песочнице. Артефакт
 * out/ не сохраняется, важен только факт успеха/лога ошибок. Если Docker не
 * поднят — skipped:true (вызывающий сам решает, считать это мягкой деградацией).
 */
export async function verifyBuildInSandbox(
  files: SandboxFile[],
  opts?: { logLabel?: string },
): Promise<VerifyBuildResult> {
  if (!(await isDockerAvailable())) {
    return { ok: false, skipped: true, logs: "Docker-демон недоступен — проверка сборки пропущена", timedOut: false, durationMs: 0 }
  }
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "osgard-verify-"))
  try {
    const build = await buildNextStaticExport(files, tmp, { logLabel: opts?.logLabel ?? "verify-build" })
    return { ok: build.ok, skipped: false, logs: build.logs, timedOut: build.timedOut, durationMs: build.durationMs }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

interface StartResult {
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

/** Запускает уже созданный контейнер с attach, собирает вывод, убивает по таймауту. */
function startAndWait(containerName: string, timeoutMs: number, logLabel: string): Promise<StartResult> {
  return new Promise<StartResult>((resolve) => {
    const child = spawn("docker", ["start", "-a", containerName], { windowsHide: true })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const MAX_LOG = 512 * 1024 // не даём логам сборки распухнуть в памяти без предела

    const onOut = (buf: Buffer) => {
      if (stdout.length < MAX_LOG) stdout += buf.toString("utf-8")
    }
    const onErr = (buf: Buffer) => {
      if (stderr.length < MAX_LOG) stderr += buf.toString("utf-8")
    }
    child.stdout?.on("data", onOut)
    child.stderr?.on("data", onErr)

    const timer = setTimeout(() => {
      timedOut = true
      // Убиваем контейнер жёстко — attach-процесс завершится следом.
      execFile("docker", ["kill", containerName], { timeout: 15_000 }, () => {})
    }, timeoutMs)

    child.on("close", (code) => {
      clearTimeout(timer)
      if (timedOut) {
        resolve({ exitCode: null, stdout, stderr: stderr + `\n[${logLabel}] превышен лимит времени ${timeoutMs}мс`, timedOut: true })
      } else {
        resolve({ exitCode: code, stdout, stderr, timedOut: false })
      }
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ exitCode: null, stdout, stderr: stderr + `\n${err.message}`, timedOut: false })
    })
  })
}
